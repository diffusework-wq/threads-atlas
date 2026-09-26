"""Reproducible, manually reviewed sample. No network or invented engagement data."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CAPTURED = '2026-09-26T08:24:00Z'
topics = [
    ('aa','AA 男','boundary',True,'從約會分帳到付出的公平感，看看金錢如何成為關係裡的語言。',['AA 制的爭議，分歧在金額還是彼此對付出的理解？','用「飲料、車費、保險」三種情境，邀請讀者討論分攤界線。','整理分帳、輪流請客、依能力分攤的不同期待，避免替性別貼標籤。']),
    ('unread','不讀不回','emotion',True,'等待回覆的焦慮、溝通節奏與衝突後的沉默。',['訊息沒有回覆時，我們是在等待答案，還是在尋找安心？','需要冷靜與直接消失，差別可以是一句怎樣的告知？','以兩種回訊息習慣寫一段對話，討論彼此的時間期待。']),
    ('love','感情','relationship',True,'不同關係經驗交會的入口：理解、信任與共同生活的想像。',['把「相處舒服」拆成具體日常：對話、付出與未來規劃。','從樣本中選兩種不同期待，設計一個不急著判對錯的討論。','邀請讀者分享一次把需求說清楚的經驗，而不是替伴侶下診斷。']),
    ('marriage','婚姻問題','relationship',True,'共同生活中的期待落差，以及人們如何描述修復或離開。',['關係的轉折是一件大事，還是許多小失望累積？','以共同生活為題，列出婚前值得交換的三個生活期待。','把「想被理解」改寫成可討論的具體需求，呈現雙方視角。']),
    ('affair','出軌','boundary',True,'關於忠誠、隱瞞、承諾與關係界線的公開討論。',['以假設情境討論：結束關係與隱瞞另一段關係，有什麼不同？','把「信任」落在具體行為，邀請讀者談自己的界線。','對比雙方事先說好的界線與事後辯解，避免影射特定人物。']),
    ('friendship','純友誼','boundary',True,'異性友誼、親密互動與旁人的愛情預設。',['熟悉就等於曖昧嗎？用友誼與愛情的不同期待切入。','單獨吃飯、每天聊天、互道晚安：界線是否需要雙方協商？','讓相信與不相信純友誼的人各說一個具體情境。']),
    ('support','接住情緒','emotion',True,'被理解的需要，與陪伴者自身界線之間的討論。',['先聽見感受，還是先提出辦法？用同一情境寫兩段回應。','陪伴是關心還是義務？同時呈現求助者與陪伴者的需求。','將「我現在沒力氣聽」改寫成有界線又有關心的一句話。']),
    ('breakup','要不要分手','relationship',True,'不捨、未來差異與離開的抉擇，並列觀點而不替人做決定。',['捨不得的是這個人，還是已經投入的時間？用提問展開討論。','相愛卻想要不同未來：把五年後的生活畫成兩張清單。','邀請讀者談關係轉折的時刻，不把單一經驗變成分手準則。']),
    ('value','情緒價值','emotion',True,'人們如何理解被回應、被支持，以及情感付出的互惠。',['情緒價值是安慰的話，還是日常裡看得見的回應？','當一方一直提供支持，另一方如何回應？以互惠切入。','從關係延伸到日常服務：一句手寫鼓勵為什麼讓人有感？']),
    ('money','金錢觀','boundary',False,'由分攤、經濟能力與付出期待等樣本延伸出的編輯分類。',None),
    ('fairness','付出與公平','boundary',False,'同樣的付出，可能被雙方用不同的方式衡量。',None),
    ('boundaries','界線感','boundary',False,'樣本中對互動分寸、責任與個人界線的不同理解。',None),
    ('trust','信任','boundary',False,'從友誼、親密關係與承諾討論延伸而來。',None),
    ('communication','溝通方式','emotion',False,'如何說出需求、回覆訊息，以及處理衝突。',None),
    ('security','安全感','emotion',False,'由等待回覆、擔心成為負擔等樣本判讀的概念。',None),
    ('listening','傾聽與陪伴','emotion',False,'樣本裡對情緒支持、理解與陪伴的期待。',None),
    ('future','未來規劃','relationship',False,'共同生活方向與人生計畫是否相容。',None),
    ('sunk','不捨與投入','relationship',False,'當關係走向改變，人們如何面對過去的投入。',None),
    ('daily','日常儀式','emotion',False,'從公開樣本延伸：日常服務中帶來支持感的小動作。',None),
]

# Source content was read in the Threads web UI. Dates come from visible time elements.
# Summaries are paraphrases; topic membership is editorial, not a claim of literal co-occurrence.
rows = [
 ('xxft_y','DZqNVnkkl02','2026-06-16T20:04:12Z','作者支持外出平均分攤費用，將理由放在賺錢辛苦、互相體諒與尊重。',['aa','money','fairness'],'post'),
 ('jksugarshop','DOyXSabkvZv','2025-09-19T14:19:44Z','作者描述伴侶要求分攤車險，質疑費用責任的界線，並表達結束關係的想法。',['aa','money','fairness','boundaries','breakup'],'post'),
 ('lynn_pipi','DE0I4NoSglH','2025-01-14T17:38:22Z','作者詢問情侶偏好的付費方式，列出分帳、單方支付與輪流請客供討論。',['aa','money','fairness','love'],'post'),
 ('iyori_520','DbxyzG4EgEA','2026-08-08T11:49:00Z','作者描述整天等不到訊息的失落，在想放下與仍然喜歡對方之間掙扎。',['unread','security','love','breakup'],'post'),
 ('mayukichou','DZHzaDFknZq','2026-06-03T11:23:26Z','作者批評衝突後反覆消失與不回訊息，認為這涉及處理關係的能力。',['unread','communication','love','boundaries'],'post'),
 ('thisiskenny__','DV57togEbkw','2026-03-15T12:32:28Z','作者以朋友長時間不回訊息為例，表達不再投入心力的看法。',['unread','communication','boundaries'],'post'),
 ('ycc_8578','DcgxNYGk43d','2026-08-26T17:39:25Z','作者向讀者提問，是否相信異性之間存在純粹的友誼。',['friendship','trust'],'post'),
 ('xixi_64320','DdBjv1UE8Ik','2026-09-08T11:16:44Z','作者列舉吃飯、頻繁聊天與問候等情境，詢問伴侶和異性互動的界線。',['friendship','boundaries','trust','love'],'post'),
 ('lichen.0924','DZEndJNj3iV','2026-06-02T05:41:17Z','作者質疑把親近的異性朋友預設為曖昧，主張欣賞、信任與陪伴不必都被定義為愛情。',['friendship','trust','listening','love'],'post'),
 ('liaorenpeng','DdtiocBH4os','2026-09-25T13:13:34Z','作者表達疲累時缺乏情緒支持的難過。',['support','listening','value'],'post'),
 ('lianliansun','DZXy3WFEoh2','2026-06-09T16:26:33Z','作者提問：承接伴侶的情緒是否是關係中的必要責任。',['support','value','boundaries','love'],'post'),
 ('light.in.pages','DPO7wK-k0TC','2025-09-30T16:37:06Z','作者將被理解的感受與實際解決問題相比，強調情緒陪伴的價值。',['support','listening','value','communication'],'post'),
 ('4180.cathyyyyyy','DciBmtJEcA2','2026-08-27T05:21:56Z','作者反思伴侶說出不舒服時的擔心，並描述主動靠近、讓對方知道需求不是負擔的回應。',['support','security','communication','love'],'post'),
 ('slowmindtalks','Ddja0zbEp1K','2026-09-21T14:52:57Z','作者將情緒穩定理解為衝突時仍願意溝通、尊重與修復，而非永遠沒有情緒。',['support','communication','boundaries','love'],'post'),
 ('angeljg417','DdvhhdtFCwK','2026-09-26T07:42:21Z','回覆者描述一段關係裡對責任、共同未來與情緒支持的期待落差。',['value','money','fairness','future','breakup'],'reply'),
 ('brogd88','Ddvkgs-CZhD','2026-09-26T08:08:28Z','作者回應長期關係結束的故事，認為經濟困境之外，也應關注上進與情緒付出是否互惠。',['value','fairness','sunk','breakup'],'post'),
 ('oqoz_tina','DdvkcYamXDZ','2026-09-26T08:07:53Z','作者分享早餐服務中的手寫文字，把日常消費連結到情緒支持的感受。',['value','daily'],'post'),
 ('waawaa5555','DPc96m6E059','2025-10-06T03:25:22Z','作者明知不想與伴侶共度一生，仍對放下關係與被遺忘感到不捨。',['breakup','sunk','future','love'],'post'),
 ('luckylove.520','DStZuZ6D9J2','2025-12-26T02:10:24Z','作者描述相處融洽卻對未來生活方向不同，因難以妥協而分開的經驗。',['breakup','future','communication','love'],'post'),
 ('a.cc_zzzz','DdeQIFaki2F','2026-09-19T14:43:15Z','作者質疑為何不先結束既有關係，而選擇隱瞞並發展另一段關係。',['affair','breakup','boundaries','trust'],'post'),
 ('rof1eo_','DX8kI_0j1uW','2026-05-05T06:07:00Z','作者認為建立信任應從行為著手，而非事後要求對方接受讓其不安的事情。',['trust','security','boundaries','love'],'post'),
 ('yyfmonica','DcQtsiXCalT','2026-08-20T12:00:53Z','作者詢問離婚者決定離開的轉折，是重大事件，還是長期期待耗盡。',['marriage','breakup','sunk','love'],'post'),
 ('self.iei7zf','DTsNeLiCeuD','2026-01-19T11:35:29Z','作者以父母在家少有交集的記憶，對照自己婚後對相處距離的理解。',['marriage','communication','love'],'post'),
 ('little_ouu','DXrFX66Eso1','2026-04-28T11:11:04Z','作者分享婚姻溝通陷入僵局後尋求協助的經驗，將改變焦點放在共同調整對話方式。',['marriage','communication','listening','love'],'post'),
 ('applerm0323','Dbk7lkxEyML','2026-08-03T11:55:41Z','作者以徵集故事的形式，邀請讀者分享發現出軌線索的經驗；本樣本不收錄留言中的個人指控。',['affair','trust'],'post'),
 ('__e.wanggg','DQYe_VsEQmN','2025-10-29T06:09:34Z','作者描述發現伴侶不忠線索時的震驚與情緒衝擊。',['affair','trust','security'],'post'),
]

def build():
    data = {'version':1, 'capturedAt':CAPTURED, 'mode':'curated_public_sample',
            'note':'資料以搜尋頁可見內容核對，非隨機抽樣；不含按讚數推估，不保證原文永久可用。',
            'topics':[dict(id=i,label=l,group=g,seed=s,description=d,**({'angles':a} if a else {})) for i,l,g,s,d,a in topics],
            'posts':[dict(id=code,url=f'https://www.threads.com/@{author}/post/{code}',timestamp=ts,summary=summary,topics=tags,kind=kind,verifiedAt=CAPTURED,classification='editorial',sourceMethod='visible_threads_search') for author,code,ts,summary,tags,kind in rows]}
    path = ROOT/'site'/'data'/'snapshot.json'
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Built {len(data["posts"])} reviewed samples, {len(topics)} topics.')

if __name__=='__main__':
    build()
