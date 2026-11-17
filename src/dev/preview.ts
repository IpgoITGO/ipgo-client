// 로컬 미리보기 도구. 개발 서버에서만 켜진다(main.tsx의 import.meta.env.DEV 가드) — 배포본에는 안 들어간다.
// ① 이번에 바꾼 곳마다 번호 점을 찍고 ② 왼쪽 아래 창에 그 번호의 설명과 ③ 평소엔 보기 힘든 상태 화면(올리기 전·계산 중·오류…)으로 가는 길을 둔다.
// 장면은 탭마다 따로 기억해서(sessionStorage) 여러 탭에 다른 상태를 나란히 띄울 수 있다. 가짜 서버(src/mocks/handlers.ts)가 같은 열쇠를 읽는다.

const SCENE_KEY = 'ipgo:preview-scene'
const RUN_KEY = 'ipgo:calculation-run'

const SCENES: Record<string, string> = {
  pre: '수불부 올리기 전',
  uploaded: '올렸지만 계산 전',
  // 수불부 확인 화면이 끝나지 않고 계속 돈다: /upload/15/result?scene=check
  check: '수불부 확인 중',
  calc: '계산 중',
  stale: '기준일이 7일 지남',
  none: '넣을 상품 없음',
  error: '대시보드를 못 불러옴',
}

/** 주소의 ?scene= 을 읽어 이 탭의 장면을 정한다. 앱이 뜨기 전에 불러야 첫 요청부터 그 장면이 온다 */
export function applyPreviewScene() {
  const params = new URLSearchParams(location.search)
  const scene = params.get('scene')
  if (!scene) return
  if (scene in SCENES) sessionStorage.setItem(SCENE_KEY, scene)
  else sessionStorage.removeItem(SCENE_KEY)
  // 계산 중 장면: 계산을 따라가는 중이라고 적어 둔다(가짜 서버가 계속 "계산 중"이라고 답한다)
  if (scene === 'calc')
    sessionStorage.setItem(
      RUN_KEY,
      JSON.stringify({ scope: 'seller@a.com', runId: 32 }),
    )
  else sessionStorage.removeItem(RUN_KEY)
  params.delete('scene')
  const rest = params.toString()
  history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : ''))
}

type Pin = {
  n: number
  /** 이 번호가 붙는 화면(주소 앞부분) */
  at: string
  /** 어느 장면에서 보이는지(없으면 평소 화면) */
  scene?: string
  pick: () => Element | null
  text: string
}

const q = (selector: string) => document.querySelector(selector)
const PINS: Pin[] = [
  {
    n: 1,
    at: '/dashboard',
    pick: () => q('section[aria-label="먼저 확인할 상품"]'),
    text: '맨 위 한 줄: 권장대로 넣을 상품과 먼저 볼 상품. 높이는 두 줄 자리로 고정',
  },
  {
    n: 2,
    at: '/dashboard',
    pick: () => q('span[data-kind="check"]'),
    text: '먼저 볼 상품만 "확인 필요"(나머지는 "지금 넣기" 그대로)',
  },
  {
    n: 3,
    at: '/dashboard',
    pick: () => q('nav[aria-label="상품 쪽"] [class*="_pages_"]'),
    text: '쪽 번호 가운데, 10개씩(10쪽에 가면 15쪽까지)',
  },
  {
    n: 4,
    at: '/dashboard',
    pick: () => q('[class*="_registerButton_"]') ?? q('[class*="_pickHint_"]'),
    text: '상품을 고르면 아래 남색 줄에 "발주로 등록". 누르면 확인 창 → 이미 발주한 물량에 들어감',
  },
  {
    n: 5,
    at: '/dashboard',
    scene: 'calc',
    pick: () => q('[data-testid="dashboard-skeleton"] section'),
    text: '계산 중: 카드는 띠와 같은 말을 되풀이하지 않고, 오른쪽 아래는 작은 알약으로 시작',
  },
  {
    n: 6,
    at: '/dashboard',
    scene: 'pre',
    pick: () => q('header[class*="_intro_"] h1'),
    text: '계산 전에는 "기준일 없음" 칸을 띄우지 않음',
  },
  {
    n: 7,
    at: '/dashboard',
    scene: 'pre',
    pick: () => q('header nav button[aria-disabled="true"]'),
    text: '수불부 올리기 전에는 입고 조건 잠금(눌러 보면 안내가 떠요)',
  },
  {
    n: 8,
    at: '/dashboard',
    scene: 'error',
    pick: () => q('main [role="alert"] p'),
    text: '오류 문구: 개발자 영어 대신 서버 안내나 한글 문장',
  },
  {
    n: 9,
    at: '/sku/',
    pick: () => q('nav[aria-label="상품 이동"]'),
    text: '"← 대시보드로"(보던 탭·정렬 그대로)와 이전·다음 상품',
  },
  {
    n: 10,
    at: '/sku/',
    pick: () => q('main header button'),
    text: '권장량으로 정하기. 누르면 같은 자리·같은 폭에서 "되돌리기"로만 바뀜',
  },
  {
    n: 11,
    at: '/sku/',
    pick: () => q('svg[aria-label="재고·출고 그래프"]'),
    text: '재고가 출고보다 4배 넘게 크면 출고 막대를 아래 띠에 따로 그림("출고 N개" 점선)',
  },
  {
    n: 12,
    at: '/sku/',
    pick: () =>
      [...document.querySelectorAll('main [role="tab"]')].find((tab) =>
        tab.textContent?.includes('주별'),
      ) ?? null,
    text: '주별 출고 탭: 화살표 메모 대신 점선 끝에 "평균 N개", 7일이 안 된 주는 "N일치"',
  },
  {
    n: 13,
    at: '/sku/',
    pick: () => q('[class*="_trendChip_"]'),
    text: '소진일이 이미 지났으면 "→ 소진" 대신 "이미 바닥났을 거예요"',
  },
  {
    n: 14,
    at: '/settings',
    pick: () => q('#inbound-settings-form h1'),
    text: '값을 고친 뒤 다른 메뉴를 누르면 나가기 전에 한 번 물어요',
  },
  {
    n: 15,
    at: '/login',
    pick: () => q('[class*="_tabs_"], [role="tablist"]'),
    text: '로그인↔회원가입을 눌러도 카드 키가 같아요',
  },
]

const LINKS: Array<[string, Array<[string, string]>]> = [
  [
    '대시보드',
    [
      ['평소 화면', '/dashboard?scene=reset'],
      ...Object.entries(SCENES).map(([key, label]): [string, string] => [
        label,
        `/dashboard?scene=${key}`,
      ]),
    ],
  ],
  [
    '상품 상세',
    [
      ['평소(권장량 있음)', '/sku/1?scene=reset'],
      ['계산 전', '/sku/no-result?scene=reset'],
      ['계산 못 함(판매 기록 부족)', '/sku/new-product?scene=reset'],
      ['입고 불필요(권장 0개)', '/sku/zero-recommendation?scene=reset'],
      ['참고용 계산', '/sku/reference-product?scene=reset'],
      ['다른 방식으로 대체', '/sku/fallback-product?scene=reset'],
      ['없는 상품', '/sku/999999?scene=reset'],
    ],
  ],
  [
    '그 밖',
    [
      ['입고 조건', '/settings?scene=reset'],
      ['입고 조건(올리기 전 → 잠김)', '/settings?scene=pre'],
      ['업로드 결과', '/upload/12/result?scene=reset'],
      ['없는 주소', '/nope'],
      ['결제 실패', '/payment/fail'],
      ['카드 등록 실패', '/billing/auth/fail'],
    ],
  ],
]

const CSS = `
#ipgo-preview{position:fixed;left:12px;bottom:12px;z-index:2147483001;font:13px/1.5 system-ui,sans-serif;color:#fff}
#ipgo-preview button.t{all:unset;cursor:pointer;background:#1f2537;color:#fff;padding:7px 12px;border-radius:999px;font-weight:700;box-shadow:0 2px 8px rgb(0 0 0 / 25%)}
#ipgo-preview .p{position:absolute;left:0;bottom:42px;width:360px;max-height:70vh;overflow:auto;background:#1f2537;border-radius:14px;padding:14px 16px;display:grid;gap:10px;box-shadow:0 8px 28px rgb(0 0 0 / 30%)}
#ipgo-preview h4{margin:6px 0 0;font-size:12px;color:#ffc53d}
#ipgo-preview ol,#ipgo-preview ul{margin:0;padding:0;list-style:none;display:grid;gap:6px}
#ipgo-preview li{display:grid;grid-template-columns:22px 1fr;gap:8px;word-break:keep-all}
#ipgo-preview li.off{opacity:.55}
#ipgo-preview b.n,.ipgo-pin{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#ffc53d;color:#1f2537;font:800 12px/1 system-ui,sans-serif}
#ipgo-preview .links{display:flex;flex-wrap:wrap;gap:6px}
#ipgo-preview a{color:#fff;text-decoration:none;background:rgb(255 255 255 / 12%);padding:3px 9px;border-radius:999px}
#ipgo-preview a:hover{background:rgb(255 255 255 / 24%)}
#ipgo-preview small{color:#c9cdd6}
#ipgo-pins{position:absolute;left:0;top:0;z-index:2147483000;pointer-events:none}
.ipgo-pin{position:absolute;pointer-events:auto;cursor:help;box-shadow:0 0 0 3px #fff,0 2px 6px rgb(0 0 0 / 30%)}
`

/** 번호 점과 왼쪽 아래 창을 붙인다 */
export function startPreview() {
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)
  const layer = document.createElement('div')
  layer.id = 'ipgo-pins'
  const box = document.createElement('div')
  box.id = 'ipgo-preview'
  document.body.append(layer, box)
  // 설명 창은 처음엔 접어 둔다(본문을 가려서). 번호 점에 마우스를 올리면 그 번호의 설명이 뜬다
  let panel = false
  let pinsOn = true
  let shown = ''

  const draw = () => {
    const scene = sessionStorage.getItem(SCENE_KEY)
    const here = PINS.filter(
      (pin) =>
        location.pathname.startsWith(pin.at) ||
        (pin.at === '/login' && location.pathname === '/signup'),
    )
    const found = here.map((pin) => {
      const target =
        (pin.scene ?? null) === scene || !pin.scene ? pin.pick() : null
      const rect = target?.getBoundingClientRect()
      return rect && rect.width > 0
        ? { pin, x: rect.left + scrollX - 11, y: rect.top + scrollY - 11 }
        : { pin }
    })
    const key = JSON.stringify([
      panel,
      pinsOn,
      scene,
      location.pathname,
      found.map((item) => [item.pin.n, item.x, item.y]),
    ])
    if (key === shown) return
    shown = key
    layer.innerHTML = found
      .map((item) =>
        item.x == null
          ? ''
          : `<span class="ipgo-pin" title="${item.pin.text.replace(/"/g, '&quot;')}" style="left:${Math.max(2, item.x)}px;top:${Math.max(2, item.y)}px">${item.pin.n}</span>`,
      )
      .join('')
    layer.style.display = pinsOn ? '' : 'none'
    const list = found
      .map(
        (item) =>
          `<li class="${item.x == null ? 'off' : ''}"><b class="n">${item.pin.n}</b><span>${item.pin.text}${item.x == null && item.pin.scene ? ` <small>· "${SCENES[item.pin.scene]}" 장면에서 보여요</small>` : ''}</span></li>`,
      )
      .join('')
    const links = LINKS.map(
      ([title, items]) =>
        `<h4>${title}</h4><div class="links">${items.map(([label, href]) => `<a href="${href}" target="_blank">${label}</a>`).join('')}</div>`,
    ).join('')
    box.innerHTML =
      (panel
        ? `<div class="p"><small>${scene ? `지금 장면: ${SCENES[scene]} · ` : ''}노란 번호가 이번에 바꾼 곳이에요</small><ol>${list || '<li class="off"><span></span><span>이 화면에는 바꾼 곳이 없어요</span></li>'}</ol><h4>다른 상태 화면(새 탭으로 열려요)</h4>${links}</div>`
        : '') +
      `<button class="t" data-do="panel" type="button">${panel ? '설명 닫기' : '번호 설명 · 다른 상태 화면'}</button> <button class="t" data-do="pins" type="button">${pinsOn ? '번호 끄기' : '번호 켜기'}</button>`
  }
  box.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('button.t')
    if (!button) return
    if (button.dataset.do === 'panel') panel = !panel
    else pinsOn = !pinsOn
    draw()
  })
  // 화면이 바뀌거나 늦게 그려져도 따라가게 가볍게 다시 잰다(같으면 아무것도 안 한다)
  setInterval(draw, 500)
  draw()
}
