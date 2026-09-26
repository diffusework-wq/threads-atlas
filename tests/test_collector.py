import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('collector', Path(__file__).resolve().parents[1] / 'scripts' / 'collect_threads.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


class CollectorTests(unittest.TestCase):
    def test_dedup_paging_and_no_token_in_output(self):
        calls = []
        def fetch(token, params):
            calls.append(dict(params))
            return {'data': [{'id': '123', 'text': 'test', 'timestamp': '2026-09-26T00:00:00Z', 'permalink': 'https://www.threads.com/@test/post/abc'}], 'paging': {'next': 'https://example.com/?access_token=SECRET', 'cursors': {'after': 'page2'}}}
        result = c.collect('SECRET', ['a', 'b'], 1, 2, 2, fetch)
        self.assertEqual(len(calls), 4)
        self.assertEqual(len(result['posts']), 1)
        self.assertEqual(result['posts'][0]['matchedQueries'], ['a', 'b'])
        self.assertTrue(all(x['pageCapReached'] for x in result['coverage']))
        self.assertNotIn('SECRET', str(result))
        self.assertFalse(result['publicSearchPermissionVerified'])

    def test_empty_result_is_not_whole_platform_zero(self):
        result = c.collect('t', ['a'], 1, 2, 1, lambda *_: {'data': []})
        self.assertEqual(result['posts'], [])
        self.assertFalse(result['coverage'][0]['isPlatformTotal'])

    def test_unexpected_response_fails_closed(self):
        with self.assertRaises(c.CollectionError):
            c.collect('t', ['a'], 1, 2, 1, lambda *_: {'error': {'message': 'SECRET'}})


if __name__ == '__main__':
    unittest.main()
