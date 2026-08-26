const moduleBaseUrl = new URL('../', import.meta.url);

export const NOVA_CONFIG = Object.freeze({
  name: 'NOVA',
  statusLabel: 'Online · Sẵn sàng hỗ trợ',
  mascotImageUrl: new URL('assets/nova-master-v3.png?v=1', moduleBaseUrl).href,
  characterSkinUrl: new URL('assets/nova-master-v3.png?v=1', moduleBaseUrl).href,
  animationRenderer: 'character',
  characters: Object.freeze({
    nova: Object.freeze({ id:'nova',name:'NOVA',gender:'male',accent:'#21d4fd',modelUrl:new URL('assets/models/nova.glb?v=3',moduleBaseUrl).href,fallbackImageUrl:new URL('assets/nova-master-v3.png?v=1',moduleBaseUrl).href }),
    luna: Object.freeze({ id:'luna',name:'LUNA',gender:'female',accent:'#ff69b4',modelUrl:new URL('assets/models/luna.glb?v=3',moduleBaseUrl).href,fallbackImageUrl:new URL('assets/luna-master-v3.png?v=1',moduleBaseUrl).href })
  }),
  support: Object.freeze({
    adminLabel: 'ADMIN VHHT',
    facebookUrl: 'https://www.facebook.com/VHHT.03052005',
    tiktokId: '@v_h_h_t',
    phone: '0354206313'
  }),
  rive: Object.freeze({
    enabled: false,
    assetUrl: new URL('assets/nova.riv', moduleBaseUrl).href,
    canvasName: 'NOVA Canvas',
    stateMachineName: 'NOVA State Machine',
    stateInputName: 'state'
  }),
  timing: Object.freeze({
    hello: 1500,
    talkingPerCharacter: 28,
    talkingMin: 1100,
    talkingMax: 4200,
    happy: 1400,
    inactivityToSleep: 90000
  }),
  chat: Object.freeze({
    maxStoredMessages: 30,
    maxInputLength: 500,
    storageKey: 'vhht_nova_phase1_chat',
    mockLatencyMin: 650,
    mockLatencyMax: 1150
  })
});

export const PAGE_SUGGESTIONS = Object.freeze({
  games: ['Giới thiệu Game Center', 'Cách chơi Gravity Tourist', 'Về Cộng đồng'],
  feed: ['Mở khung đăng bài', 'Góp ý với admin', 'Quyền riêng tư'],
  messages: ['Cách nhắn tin?', 'Liên hệ admin', 'Gửi hình ảnh'],
  profile: ['Sửa hồ sơ', 'Đổi ảnh đại diện', 'Quyền riêng tư'],
  admin: ['Xem thống kê', 'Quản lý người dùng', 'Kiểm duyệt bài viết'],
  auth: ['Cách đăng nhập?', 'Tạo tài khoản', 'Quên mật khẩu'],
  home: ['Khám phá cộng đồng', 'Đăng nhập', 'NOVA làm được gì?']
});

export function detectNovaPageContext(locationLike = window.location) {
  const path = String(locationLike.pathname || '/').toLowerCase();
  if (path.includes('/games')) { const label=path.includes('gravity-tourist')?'Gravity Tourist':'Game Center';return {key:'games',label,path,title:document.title||label}; }
  let key = 'home';
  let label = 'Trang chào mừng';
  if (path.includes('messages')) [key, label] = ['messages', 'Trạm liên lạc'];
  else if (path.includes('profile')) [key, label] = ['profile', 'Hồ sơ cá nhân'];
  else if (path.includes('admin')) [key, label] = ['admin', 'Trung tâm quản trị'];
  else if (path.includes('login') || path.includes('register')) [key, label] = ['auth', 'Xác thực tài khoản'];
  else if (path.includes('community')) [key, label] = ['feed', 'Không gian cộng đồng'];
  return { key, label, path, title: document.title || label };
}
