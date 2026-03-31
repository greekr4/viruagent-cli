---
name: provider-build
description: "viruagent-cli에 새 프로바이더를 추가하거나 기존 프로바이더를 수정한다. 프로바이더 코드 구현, 커맨드 등록, CLI 연결 작업을 수행. '프로바이더 추가', '프로바이더 수정', '새 기능 구현', '카페 프로바이더', 'provider' 등을 언급하면 이 스킬을 사용할 것."
---

# Provider Builder

viruagent-cli의 프로바이더를 구현/수정한다.

## 프로바이더 패턴

### 파일 구조
```
src/providers/{name}/
├── index.js          # createXxxProvider 팩토리
├── auth.js           # 인증 (HTTP or Playwright)
├── session.js        # 세션 영속화 + rate limit
├── apiClient.js      # API 호출 레이어
└── utils.js          # 유틸리티
```

### 팩토리 패턴

```javascript
const createXxxProvider = ({ sessionPath } = {}) => {
  // 세션, API 클라이언트 초기화
  return {
    id: 'xxx',
    name: 'XXX',
    login: async (opts) => { /* ... */ },
    authStatus: async () => { /* ... */ },
    logout: async () => { /* ... */ },
    publish: async (opts) => { /* ... */ },
    // 프로바이더별 추가 메서드
  };
};
module.exports = { createXxxProvider };
```

### 등록 순서

1. `src/providers/{name}/` 디렉토리에 코드 생성
2. `src/services/providerManager.js`에 프로바이더 등록
3. `src/runner.js`에 커맨드 case 추가
4. `bin/index.js`에 CLI 커맨드 정의

## 참고 프로바이더

| 패턴 | 참고 대상 |
|------|----------|
| 순수 HTTP (브라우저 불필요) | `src/providers/insta/`, `src/providers/reddit/` |
| Playwright 브라우저 | `src/providers/naver/`, `src/providers/tistory/` |
| 쿠키 기반 인증 | `src/providers/x/` |
| OAuth2 인증 | `src/providers/reddit/` |

## 코드 규칙

- CommonJS (`require`/`module.exports`)
- Node.js 18+
- 세션 저장: `~/.viruagent-cli/sessions/{name}-session.json`
- 에러: `createError(code, message, hint)` 패턴
- 응답: `{ ok: true, data: {...} }` 형식
