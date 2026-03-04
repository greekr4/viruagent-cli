# viruagent-cli

`viruagent-mcp`와 동일한 provider 실행 로직을 독립적으로 옮겨 놓은 CLI입니다.
MCP 서버를 거치지 않고 CLI만으로 로그인/발행/조회 동작을 실행할 수 있습니다.

## 설치 및 실행

```bash
cd /Users/tk/Desktop/project/viruagent-cli
npm start -- status
```

또는 로컬 바이너리:

```bash
node bin/index.js status --provider tistory
```

## 제공 명령어

- `status`, `auth-status`
- `login`
- `publish`
- `save-draft`
- `list-categories`
- `list-posts`
- `read-post`
- `logout`
- `list-providers`

## 공통 옵션

- `--provider <tistory|naver>`: 기본값 `tistory`

## 예시

```bash
node bin/index.js login --username "<아이디>" --password "<비밀번호>" --provider tistory
node bin/index.js publish --title "테스트 글" --content-file ./samples/post.html --provider tistory
node bin/index.js list-categories --provider tistory
node bin/index.js read-post --post-id 12345 --provider tistory
```

`publish`, `save-draft`는 `--content` 또는 `--content-file` 중 하나가 필요합니다.
