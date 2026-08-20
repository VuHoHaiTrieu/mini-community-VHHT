export function normalizeVietnamese(value) {
  return String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const DEFINITIONS = Object.freeze([
  { name: 'contactSupport', phrases: ['lien he admin', 'nhan tin cho admin', 'gop y voi admin', 'toi muon gop y', 'toi muon phan anh', 'bao loi cho admin', 'toi co de xuat', 'toi can admin ho tro', 'website kho dung', 'thao tac bat tien'] },
  { name: 'capabilities', phrases: ['ban lam duoc gi', 'nova lam duoc gi', 'co the giup gi', 'chuc nang cua nova', 'ky nang cua ban', 'giup duoc gi'] },
  { name: 'openComposer', phrases: ['mo khung dang bai', 'bat khung dang bai', 'toi muon dang bai', 'viet bai moi', 'tao bai viet moi', 'cho toi dang bai'] },
  { name: 'focusSearch', phrases: ['mo tim kiem', 'bat tim kiem', 'tim kiem giup toi', 'toi muon tim kiem', 'mo o tim kiem', 'tim thanh vien'] },
  { name: 'goMessages', phrases: ['di den tin nhan', 'mo tin nhan', 'vao tin nhan', 'mo tram lien lac', 'dua toi tin nhan', 'toi cho nhan tin'] },
  { name: 'goProfile', phrases: ['mo ho so', 'xem ho so', 'vao ho so', 'mo trang ca nhan', 'dua toi ho so', 'trang cua toi'] },
  { name: 'goCommunity', phrases: ['quay lai trang cong dong', 've trang cong dong', 'mo cong dong', 'vao trang chinh', 'quay lai trang chinh', 'dua toi cong dong'] },
  { name: 'openNotifications', phrases: ['mo thong bao', 'xem thong bao', 'kiem tra thong bao', 'co thong bao gi', 'dua toi thong bao'] },
  { name: 'openSettings', phrases: ['mo cai dat', 'vao cai dat', 'cai dat tai khoan', 'chinh quyen rieng tu', 'dua toi cai dat'] },
  { name: 'openMyPosts', phrases: ['mo bai viet cua toi', 'xem bai toi dang', 'bai dang cua toi', 'quan ly bai viet cua toi'] },
  { name: 'postHelp', phrases: ['cach dang bai', 'dang bai nhu the nao', 'huong dan dang bai', 'lam sao de dang bai'] },
  { name: 'messageHelp', phrases: ['cach nhan tin', 'gui tin nhan the nao', 'huong dan nhan tin', 'cach gui anh'] },
  { name: 'profileHelp', phrases: ['sua ho so', 'doi anh dai dien', 'cap nhat trang ca nhan', 'chinh sua ho so'] },
  { name: 'privacy', phrases: ['quyen rieng tu', 'bao mat', 'ai co the xem', 'an bai viet', 'du lieu ca nhan'] },
  { name: 'friends', phrases: ['ket ban', 'tim ban be', 'gui loi moi ket ban', 'danh sach ban be'] },
  { name: 'statistics', phrases: ['xem thong ke', 'bao cao thong ke', 'so lieu quan tri'] },
  { name: 'moderation', phrases: ['kiem duyet bai', 'quan ly bai viet', 'quan ly nguoi dung'] },
  { name: 'greeting', phrases: ['xin chao', 'chao nova', 'hello nova', 'hello', 'hi nova'] },
  { name: 'thanks', phrases: ['cam on', 'cam on nova', 'thank you', 'thanks'] }
]);

const NATURAL_RULES = Object.freeze([
  ['contactSupport', /\b(?:gop y|phan anh|phan nan|bao loi|khieu nai|de xuat|kien nghi|y kien|khong hai long|bat tien|kho dung|can ho tro|can giup|muon them|mong muon|yeu cau).{0,38}\b(?:admin|quan tri|website|web|he thong|tinh nang|chuc nang|thao tac|loi|van de|ho tro|giup|xu ly)?\b|\b(?:lien he|nhan tin|noi chuyen|gap).{0,24}\b(?:admin|quan tri vien|chu web)\b|\b(?:khong the|khong|chua).{0,22}\b(?:dang nhap|dang bai|xoa|sua|mo|su dung|thao tac).{0,18}\b(?:duoc|noi)\b|\b(?:tai khoan).{0,20}\b(?:bi khoa|vo hieu hoa|han che|mat quyen)\b|\b(?:toi muon.{0,22}co them|web nen co|he thong nen co)\b|\b(?:xoa|khoa|mo khoa|khoi phuc).{0,24}\b(?:tai khoan|nguoi dung)\b|\b(?:an|go|xoa).{0,20}\b(?:bai viet|noi dung).{0,16}\b(?:nguoi khac|thanh vien)\b/],
  ['openComposer', /\b(?:mo|bat|hien|dua|dan|cho|muon|can|toi).{0,28}\b(?:dang bai|viet bai|tao bai|soan bai|chia se bai)|\b(?:dang|viet|tao)\s+(?:mot\s+)?bai\b/],
  ['focusSearch', /\b(?:tim|kiem|tra|search).{0,24}\b(?:nguoi|ban|thanh vien|tai khoan)|\b(?:mo|bat|dua|dan).{0,20}\b(?:tim kiem|o tim|thanh search)\b/],
  ['goMessages', /\b(?:mo|vao|den|toi|qua|dua|dan|xem).{0,28}\b(?:tin nhan|nhan tin|nhan voi|noi chuyen|tro chuyen|hop thu|doan chat|chat)|\b(?:muon|can).{0,20}\b(?:nhan tin|nhan voi|noi chuyen|chat)\b/],
  ['goProfile', /\b(?:mo|vao|den|toi|qua|dua|dan|xem).{0,22}\b(?:ho so|trang ca nhan|profile|thong tin cua toi)|\b(?:ho so|profile)\s+(?:cua\s+)?toi\b/],
  ['goCommunity', /\b(?:ve|quay lai|mo|vao|den|dua|dan).{0,22}\b(?:cong dong|trang chinh|bang tin|home|newsfeed)\b/],
  ['openNotifications', /\b(?:mo|xem|kiem tra|co gi|dua|dan).{0,22}\b(?:thong bao|notification|chuong)\b/],
  ['openSettings', /\b(?:mo|vao|den|dua|dan|chinh).{0,22}\b(?:cai dat|setting|thiet lap|tuy chon|quyen rieng tu)\b/],
  ['openMyPosts', /\b(?:mo|xem|quan ly|tim|dua).{0,24}\b(?:bai cua toi|bai toi dang|bai viet cua minh|noi dung cua toi)\b/]
]);

function editDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0]; row[0] = i;
    for (let j = 1; j <= right.length; j += 1) { const above=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,diagonal+(left[i-1]===right[j-1]?0:1));diagonal=above; }
  }
  return row[right.length];
}

const tokenMatches = (queryToken, phraseToken) => queryToken === phraseToken
  || (queryToken.length >= 4 && phraseToken.length >= 4 && editDistance(queryToken, phraseToken) <= 1);

function phraseScore(query, phrase) {
  if (query === phrase) return 1;
  if (query.includes(phrase)) return .94;
  const queryTokens = new Set(query.split(' '));
  const phraseTokens = phrase.split(' ');
  const overlap = phraseTokens.filter(token => [...queryTokens].some(queryToken => tokenMatches(queryToken, token))).length;
  const coverage = overlap / phraseTokens.length;
  const precision = overlap / Math.max(queryTokens.size, 1);
  return coverage * .72 + precision * .28;
}

export class NovaIntentEngine {
  detect(message) {
    const normalized = normalizeVietnamese(message);
    if (!normalized) return { intent: 'unknown', confidence: 0, normalized };
    const naturalMatch = NATURAL_RULES.find(([, pattern]) => pattern.test(normalized));
    if (naturalMatch) return { intent: naturalMatch[0], confidence: .91, normalized };
    let best = { intent: 'unknown', confidence: 0, normalized };
    for (const definition of DEFINITIONS) {
      const confidence = Math.max(...definition.phrases.map(phrase => phraseScore(normalized, phrase)));
      if (confidence > best.confidence) best = { intent: definition.name, confidence, normalized };
    }
    if (best.confidence < .62) return { intent: 'unknown', confidence: best.confidence, normalized };
    return best;
  }

  getExamples() {
    return ['Mở khung đăng bài', 'Mở tìm kiếm', 'Đi đến tin nhắn', 'Mở hồ sơ', 'Quay lại cộng đồng', 'Hướng dẫn quyền riêng tư'];
  }
}

export const novaIntent = new NovaIntentEngine();
