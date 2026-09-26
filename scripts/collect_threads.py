"""Read-only Threads keyword search. Tokens and raw posts never enter site/.

Run with python scripts/collect_threads.py --max-pages 1 (9 queries maximum).
Requires an approved token with the appropriate public keyword-search access.
Zero service purchases; runs only on explicit invocation, no scheduled jobs.
"""
import argparse
import getpass
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
KEYWORDS = ['AA男', '不讀不回', '感情', '婚姻問題', '出軌', '純友誼', '接住情緒', '要不要分手', '情緒價值']
ENDPOINT = 'https://graph.threads.net/v1.0/keyword_search'


class CollectionError(Exception):
    pass


def safe_record(item, keyword):
    url = item.get('permalink', '')
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname not in ('www.threads.com', 'threads.com', 'www.threads.net', 'threads.net') or '/post/' not in parsed.path:
        return None
    if not item.get('id') or not item.get('timestamp'):
        return None
    # Explicit allowlist; never serialize arbitrary response fields or paging URLs.
    return {'id': str(item['id']), 'url': url, 'timestamp': item['timestamp'],
            'text': item.get('text', ''), 'username': item.get('username', ''),
            'matchedQueries': [keyword], 'reviewed': False}


def request_page(token, params):
    request = Request(ENDPOINT + '?' + urlencode(params), headers={'Authorization': 'Bearer ' + token})
    try:
        with urlopen(request, timeout=35) as response:
            return json.load(response)
    except HTTPError as error:
        # Do not print provider messages or request URLs; these can contain secrets.
        code = None
        try:
            code = json.loads(error.read()).get('error', {}).get('code')
        except (ValueError, AttributeError):
            pass
        raise CollectionError(f'HTTP {error.code}; Meta error code {code}. Check token, permission approval or quota.') from None
    except (URLError, TimeoutError, ValueError):
        raise CollectionError('Network or response error; raw details suppressed to protect credentials.') from None


def collect(token, keywords, start, end, max_pages, fetch=request_page):
    records, coverage = {}, []
    for keyword in keywords:
        params = {'q': keyword, 'search_type': 'RECENT', 'search_mode': 'KEYWORD',
                  'fields': 'id,text,timestamp,permalink,username', 'since': start, 'until': end, 'limit': 50}
        pages, count, truncated = 0, 0, False
        while pages < max_pages:
            payload = fetch(token, params)
            if not isinstance(payload.get('data'), list):
                raise CollectionError('Unexpected response; collection stopped without publishing.')
            for item in payload['data']:
                record = safe_record(item, keyword)
                if record is None:
                    continue
                count += 1
                if record['id'] in records:
                    if keyword not in records[record['id']]['matchedQueries']:
                        records[record['id']]['matchedQueries'].append(keyword)
                else:
                    records[record['id']] = record
            pages += 1
            paging = payload.get('paging', {})
            after = paging.get('cursors', {}).get('after')
            more = bool(paging.get('next') and after)
            truncated = more
            if not more:
                break
            params['after'] = after
        coverage.append({'query': keyword, 'pages': pages, 'returnedRecords': count,
                         'pageCapReached': truncated, 'isPlatformTotal': False})
    return {'collectedAt': datetime.now(timezone.utc).isoformat(), 'since': start, 'until': end,
            'method': 'official_keyword_search', 'publicSearchPermissionVerified': False,
            'note': 'Search results require manual relevance/permission review. Never infer whole-platform totals.',
            'coverage': coverage, 'posts': list(records.values())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--max-pages', type=int, choices=range(1, 6), default=1)
    parser.add_argument('--keyword', action='append', help='Override keyword list; repeat for multiple queries')
    parser.add_argument('--hours', type=int, default=48)
    args = parser.parse_args()
    if not 1 <= args.hours <= 168:
        parser.error('--hours must be between 1 and 168')
    token = os.environ.get('THREADS_ACCESS_TOKEN')
    if not token:
        if not sys.stdin.isatty():
            print('Missing THREADS_ACCESS_TOKEN. Run interactively to enter it without echo.', file=sys.stderr)
            return 2
        token = getpass.getpass('Threads token (hidden; do not paste into chat): ').strip()
    if not token:
        print('No token supplied. Nothing requested.')
        return 2
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=args.hours)
    try:
        result = collect(token, args.keyword or KEYWORDS, int(start.timestamp()), int(end.timestamp()), args.max_pages)
    except CollectionError as error:
        print(str(error), file=sys.stderr)
        return 1
    private = ROOT / '.private'
    private.mkdir(exist_ok=True)
    path = private / ('threads-' + end.strftime('%Y%m%dT%H%M%SZ') + '.json')
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Collected {len(result["posts"])} unique posts into .private/{path.name}.')
    print('Not published. Review relevance, public-search scope, timestamps and allowed use before preparing a public snapshot.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
