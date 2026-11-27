# Brain Forge

Brain Forge は、工場の設備を操作しながら、観察・仮説・実験・一般化を通して競技プログラミングの考察力を鍛える Web 学習ゲームです。現在の開発画面では、React の起動状態、FastAPI との通信結果、Supabase クライアントの設定状態を確認できます。初回起動に Supabase アカウントやデータベースは不要です。

## 使用技術と開発ツール

| 用途 | 検証したバージョン |
| --- | --- |
| Web | Node.js 24.22.1 LTS、pnpm 10.34.9、React / React DOM 19.3.1、TypeScript 5.9.3（strict）、Vite 8.3.8、CSS、ESLint 10.15.0 |
| API | Python 3.13.15、uv 0.13.9、FastAPI 0.165.0、Uvicorn 0.54.0、Pydantic 2.14.4、pydantic-settings 2.16.3 |
| Judge0 通信・テスト | HTTPX2 2.16.2、pytest 9.2.0 |
| データ・認証 | Supabase JavaScript Client 2.119.2。PostgreSQL と Supabase Auth は今後利用予定 |
| 作業環境 | Windows、PowerShell、Git for Windows。エディターは VS Code を想定 |

Node.js は Vite がサポートする LTS 系列を選び、パッチバージョンを `.nvmrc` に記録しています。JS と Python の依存バージョンは、それぞれ `pnpm-lock.yaml` と `apps/api/uv.lock` で再現します。[Node.js のリリース状況](https://nodejs.org/en/about/previous-releases) · [Vite の動作要件](https://vite.dev/guide/) · [typescript-eslint の互換性](https://typescript-eslint.io/users/dependency-versions/)

## Windows での初期セットアップ

新しくクローンした場合は下記の手順 1 から準備してください。今回構築した Windows 環境で開発を再開する場合は、Git 管理外$PWの `.local-tools` にある pnpm と uv を利用できます。各 PowerShell で次の設定を行い、「起動と疎通確認」に進んでください。

```powershell
$env:Path = "D\.local-tools\pnpm;
$env:npm_config_store_dir = "$PWD\.local-tools\pnpm-store"
```$PWD\.local-tools\uv\bin;$env:Path"
$env:UV_CACHE_DIR = "$PWD\.local-tools\uv-cache"

1. Git でリポジトリをクローンし、VS Code で `brain-forge` を開きます。以降はすべてリポジトリのルートで実行します。
2. Node.js 24.22.1 をインストールします。nvm-windows を利用している場合は、次のようにバージョンを選択できます。

```powershell
$nodeVersion = (Get-Content .nvmrc -Raw).Trim()
nvm install $nodeVersion
nvm use $nodeVersion
node --version
```

3. pnpm と uv を導入します。すでに所定のツールがある手順は省略できます。

```powershell
npm.cmd install --global pnpm@10.34.9
winget install --exact --id astral-sh.uv
```

4. 新しい PowerShell を開き、Python とプロジェクトの依存を準備します。Python 3.13.15 が導入済みなら `uv python install` は省略できます。仮想環境は `apps/api/.venv` に作成されます。

```powershell
pnpm.cmd --version
uv --version
uv python install 3.13.15
pnpm.cmd install --frozen-lockfile
uv sync --directory apps/api --python 3.13.15 --locked
```

`pnpm.cmd` は Windows 用の起動コマンドです。VS Code の Python インタープリターには `apps/api/.venv/Scripts/python.exe` を選択できます。[pnpm のインストール](https://pnpm.io/installation) · [uv のインストール](https://docs.astral.sh/uv/getting-started/installation/) · [uv のプロジェクト管理](https://docs.astral.sh/uv/guides/projects/)

## 起動と疎通確認

ルートで PowerShell のターミナルを2つ開きます。1つ目で API、2つ目で Web を起動します。

| ターミナル | コマンド | URL |
| --- | --- | --- |
| 1 · FastAPI | `pnpm.cmd dev:api` | http://localhost:8000/api/v1/health |
| 2 · React | `pnpm.cmd dev:web` | http://localhost:5173 |

ブラウザーで Web を開くと工場画面が表示され、API の表示が「接続確認中」から「正常接続」に変わります。通信に失敗した場合は API の起動とポートを確認し、「再確認」を押してください。各サーバーは起動したターミナルの Ctrl+C で停止できます。

コンベア搬送の試作は、`pnpm.cmd dev:web` で Web を起動し、[コンベア搬送システム](http://localhost:5173/prototypes/conveyor/) を開くと試せます。Prototype 02 は空のラインから始まり、2 Tickごとに採掘機がコンテナを供給し、出荷ゲートが右端から回収します。初期状態は停止中で、速度は 1 倍（500 ms / Tick）です。API や Supabase の設定は不要です。

```powershell
Invoke-RestMethod http://localhost:8000/api/v1/health | ConvertTo-Json -Compress
# {"status":"ok","service":"brain-forge-api"}
```

CORS は `http://localhost:5173` と `http://127.0.0.1:5173` からの GET と POST、および `Authorization` ヘッダーを許可します。Vite は 5173 番が使用中なら起動を停止します。開発ポートを変更する場合は `apps/web/vite.config.ts` と `apps/api/app/main.py` の許可オリジンを合わせてください。[FastAPI の CORS 設定](https://fastapi.tiangolo.com/tutorial/cors/)

## 環境変数

既定値のまま Web と API を起動できます。接続先を指定するときは、初回だけサンプルをコピーして編集し、対象サーバーを再起動します。

```powershell
if (!(Test-Path apps/web/.env.local)) { Copy-Item apps/web/.env.example apps/web/.env.local }
if (!(Test-Path apps/api/.env.local)) { Copy-Item apps/api/.env.example apps/api/.env.local }
```

| ファイル | 変数 | 値・用途 |
| --- | --- | --- |
| `apps/web/.env.local` | `VITE_API_BASE_URL` | 既定値は `http://localhost:8000`。API のオリジンを指定 |
| 同上 | `VITE_SUPABASE_URL` | Supabase の Project URL |
| 同上 | `VITE_SUPABASE_PUBLISHABLE_KEY` | ブラウザー用の公開キー（`sb_publishable_` で始まる値） |
| `apps/api/.env.local` | `SUPABASE_URL` | Web と同じ Supabase Project URL |
| 同上 | `SUPABASE_PUBLISHABLE_KEY` | Web と同じ公開キー。Supabase Auth にトークンの確認を依頼する際に使用 |
| 同上 | `SUPABASE_DB_URL` | `brain_forge_api` ロール用の PostgreSQL 接続文字列 |

Web は URL と公開キーがそろうと、既存のセッションを復元するか、匿名でサインインします。ST-001 のプレイには、匿名認証を有効にした Supabase と FastAPI の認証・DB 接続設定が必要です。工場画面の下部では、認証状態と公開ヘルスチェックを確認できます。

`VITE_` の値はビルド成果物に含まれます。シークレットキーと旧 `service_role` キーはサーバー側だけで管理してください。Git には設定例の `.env.example` を含め、実際の `.env`・`.env.local` は除外します。[Vite の環境変数](https://vite.dev/guide/env-and-mode) · [Supabase の API キー](https://supabase.com/docs/guides/api/api-keys)

## Judge0 のローカル疎通確認

`apps/api/.env.local` に以下を設定し、`pnpm.cmd dev:api` で起動します。既存の `.env.local` がある場合は Judge0 の項目を追記します。

| 変数 | 設定値 |
| --- | --- |
| `APP_ENV` / `JUDGE0_DEV_ENABLED` | `development` / `true`。両方を指定した場合に開発用 API が有効 |
| `JUDGE0_BASE_URL` | 自分の固定の Tailscale Serve URL |
| `JUDGE0_PYTHON_LANGUAGE_ID` | 接続先の `GET /languages` に表示される Python の ID |
| `JUDGE0_DEV_TOKEN` | ローカル FastAPI 専用の Bearer トークン。`uv run --directory apps/api --locked python -c "import secrets; print(secrets.token_urlsafe(32))"` で生成 |
| `JUDGE0_AUTH_TOKEN` | 接続先が Judge0 の `X-Auth-Token` を要求する場合の値 |
| `JUDGE0_REQUEST_TIMEOUT` | Judge0 への各 HTTP リクエストの上限秒数。既定値は `3` |
| `JUDGE0_MAX_POLL_SECONDS` / `JUDGE0_MAX_POLL_ATTEMPTS` | 提出後のポーリングの上限秒数と回数。既定値は `15` 秒、`30` 回 |

ローカル FastAPI への接続は `127.0.0.1` へ直接行います。Tailscale Serve は Ubuntu VM 上の Judge0 への接続に使います。

```powershell
$judge0DevApi = 'http://127.0.0.1:8000/api/v1/dev/judge0'
$judge0DevToken = Read-Host 'JUDGE0_DEV_TOKEN' -AsSecureString
$judge0DevCredential = [pscredential]::new('judge0', $judge0DevToken)
$judge0DevHeaders = @{ Authorization = 'Bearer ' + $judge0DevCredential.GetNetworkCredential().Password }
Invoke-RestMethod "$judge0DevApi/health" -Headers $judge0DevHeaders
@('print(1 + 2)', 'raise RuntimeError("test")', 'while True: pass') | ForEach-Object {
    Invoke-RestMethod "$judge0DevApi/execute" -Method Post -Headers $judge0DevHeaders `
        -ContentType 'application/json' -Body (@{ source_code = $_ } | ConvertTo-Json -Compress)
}
$sortingBody = @{ source_code = "def sort_parts(a):`n    return sorted(a)" } | ConvertTo-Json -Compress
Invoke-RestMethod "$judge0DevApi/sorting/judge" -Method Post -Headers $judge0DevHeaders `
    -ContentType 'application/json' -Body $sortingBody
Remove-Variable judge0DevHeaders, judge0DevCredential, judge0DevToken
```

- `GET /health` は接続先の有効な言語一覧と設定した Python ID を返します。`POST /execute` は `source_code` だけを受け取ります。3 つの例の期待結果は順に `Accepted`（`stdout` は `"3\n"`）、`Runtime Error`、`Time Limit Exceeded` です。
- `execution_time` は Judge0 が計測した CPU 時間（秒）、`memory_usage` は使用メモリ（KB）です。未計測値は `null` です。Judge0 が報告する `Internal Error` はステータスだけを返します。通信障害は `503`、リクエストやポーリングのタイムアウトは `504`、不正な上流応答は `502` です。[Judge0 Extra CE API](https://extra-ce.judge0.com/)
- ソースは最大 10,000 文字です。同時に処理する実行リクエストは API プロセスあたり 1 件で、追加の実行リクエストは `429` を返します。Judge0 には CPU 2 秒、実時間 5 秒、メモリ 128,000 KB、ネットワーク無効を指定します。FastAPI がポーリングを終了した時点で Judge0 側のジョブが残る場合があるため、VM 側にもワーカー数、キュー上限、外向き通信の制限を設定します。
- 開発用 API は単一ワーカーのループバック起動で使い、リバースプロキシや Tailscale Serve で公開しないでください。Judge0 側は tailnet の許可ユーザーに絞り、VM に本番の認証情報を置かないでください。

### Sorting Judge の正当性試験

`pnpm.cmd dev:api` と `pnpm.cmd dev:web` を起動し、[仕分け施設](http://localhost:5173/map/?view=sorting) の「サーバー採点」を押します。押した時点の `sorting.py` の下書きを採点します。採点中に編集や施設の切り替えをしても、元のリクエストを待ち、送信した下書きの結果を表示します。「試験開始」は引き続き Pyodide で動作します。

開発時の Vite は、同一オリジンのループバック接続から来た採点リクエストを `127.0.0.1:8000` の FastAPI に転送します。Vite は `apps/api/.env` と `apps/api/.env.local` またはサーバーの環境変数から `JUDGE0_DEV_TOKEN` を読み、FastAPI へだけ Bearer ヘッダーを付けます。設定変更後は両サーバーを再起動します。Vite と FastAPI はループバックで起動し、外部に公開しないでください。採点画面と転送経路は開発サーバーで使う構成です。

同じローカル認証で `POST /api/v1/dev/judge0/sorting/judge` に `source_code` を送ります。`sort_parts(a)` は整数リストを受け取り、同じ要素と重複数を保った昇順の整数リストを返します。採点は入力のコピーを渡すため、入力をその場でソートして返す実装も使えます。

固定 seed `42` のランダム・逆順・昇順・重複多数と、全要素同一・1 要素・空・負数とゼロを含む配列の計 8 ケースを最大 45 秒で試します。1 ケース 1 提出で、`/execute` と同じ実行枠・リソース制限を共有します。45 秒は採点リクエスト全体の待機上限です。

応答の `status` は `passed`、`failed`、`unavailable` のいずれかで、`cases` にケース名・合否・理由を返します。通信障害や Judge0 側の異常は `503` で、判定済みのケースを返します。通信障害やユーザーコードの時間・メモリ制限で打ち切った残りのケースは `not_run` です。Python が `MemoryError` を返した場合に `memory_limit_exceeded` と判定します。Judge0 が原因を示さずプロセスを終了した場合は実行エラーとして扱います。[Judge0 Extra CE API](https://extra-ce.judge0.com/)

FastAPI が戻り値の型・要素数・順序・期待値への一致を検証します。ユーザーコードとハーネスは Judge0 内で同じ Python プロセスを共有するため、信頼された開発環境で使ってください。公開採点には、ユーザーコードと判定処理を分離した信頼境界が必要です。

通常の API テストはモックを使います。上の Judge0 設定で実接続を確認する場合は、リポジトリのルートで次を実行します。

```powershell
$env:BRAIN_FORGE_RUN_JUDGE0_E2E = '1'
try {
    pnpm.cmd test:api tests/test_sorting_judge_e2e.py
} finally {
    Remove-Item Env:BRAIN_FORGE_RUN_JUDGE0_E2E
}
```

## Supabase で認証と進捗保存を使う

1. ローカル環境ではリポジトリのルートで `supabase start` を使います。同梱の設定で匿名サインインが有効になります。ホスト環境では Brain Forge 用のプロジェクトで匿名サインインを有効にし、`supabase/migrations` のマイグレーションを適用します。[匿名サインインの設定](https://supabase.com/docs/guides/auth/auth-anonymous) · [ローカル開発](https://supabase.com/docs/guides/local-development)
2. マイグレーションが作成する `brain_forge_api` ロールに、管理者として `psql` の `\password brain_forge_api` で専用パスワードを設定します。API の接続文字列にはこのロールを使います。共有プーラーのユーザー名は `brain_forge_api.<project-ref>` です。[PostgreSQL の接続方法](https://supabase.com/docs/guides/database/connecting-to-postgres)
3. 上記の環境変数を設定して Web と API を再起動します。工場画面で ST-001 が始まり、同じブラウザーで再読み込みすると直前の挑戦を復元します。`GET /api/v1/me/progress` は本人のベストスキャン数とクリア回数を返します。

PostgreSQL を使う統合テストは、マイグレーション適用済みのテスト DB を `BRAIN_FORGE_TEST_ADMIN_DSN` と `BRAIN_FORGE_TEST_API_DSN` で指定して `pnpm.cmd test:api` を実行します。テスト DB で後者は `brain_forge_api` ロールを使います。

## 品質チェック

| コマンド | 確認内容 |
| --- | --- |
| `pnpm.cmd lint` | ESLint。警告も失敗として扱う |
| `pnpm.cmd typecheck` | TypeScript の strict 型チェック |
| `pnpm.cmd build` | 型チェックと本番用ビルド。出力は `apps/web/dist` |
| `pnpm.cmd test:web` | ゲーム API、認証、検品の再送、ヘルスチェック、工場画面のモックテスト |
| `pnpm.cmd test:api` | pytest。ヘルスチェック、検品ルール、認証と所有者チェック、Judge0 のモック実行、および設定時の PostgreSQL 永続化と RLS を検証 |

API クライアントと型生成の詳細は [M4-2 ゲーム API クライアント](docs/game-api-client.md) を参照してください。

## ディレクトリと設計方針

| パス | 役割 |
| --- | --- |
| `apps/web/src/components` | 表示と操作。通信処理は `services/health.ts` に委譲 |
| `apps/web/src/lib`・`types` | Supabase クライアントの初期化と環境変数の型 |
| `apps/web/src/features/game`・`features/stages` | ゲームの状態・ルールと、ステージ固有の定義を配置する予定 |
| `apps/web/src/renderers` | 将来の 2D・3D 描画の配置先。ゲーム状態を描画方式から独立させる |
| `apps/api/app` | `main.py` が起点。`api` はルート、`core` は設定、`schemas` は入出力型、`services` は将来の業務処理 |
| `apps/api/tests` | API の自動テスト |
| `packages/contracts` | 将来 Web と API で共有するデータ契約 |
| `supabase/migrations` | PostgreSQL テーブルと RLS の変更履歴を配置する予定 |
| `docs` | [MVP設計書](docs/mvp-design.md)などの設計資料 |

## 今後の開発予定

[MVP設計書](docs/mvp-design.md)に沿って、まず「鉱石の検品ライン」の2Dプロトタイプを作成します。続いて FastAPI に探索ルールとテストを実装し、Supabase の匿名認証、挑戦管理、進捗保存、RLS を導入します。UIとAPIの統合後にプレイテストを行います。3D表示、自動化プログラミング、シミュレーションの Web Worker 化はその後の拡張候補です。
