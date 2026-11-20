# Brain Forge

Brain Forge は、工場の設備を操作しながら、観察・仮説・実験・一般化を通して競技プログラミングの考察力を鍛える Web 学習ゲームです。現在の開発画面では、React の起動状態、FastAPI との通信結果、Supabase クライアントの設定状態を確認できます。初回起動に Supabase アカウントやデータベースは不要です。

## 使用技術と開発ツール

| 用途 | 検証したバージョン |
| --- | --- |
| Web | Node.js 24.22.1 LTS、pnpm 10.34.9、React / React DOM 19.3.1、TypeScript 5.9.3（strict）、Vite 8.3.8、CSS、ESLint 10.15.0 |
| API | Python 3.13.15、uv 0.13.9、FastAPI 0.165.0、Uvicorn 0.54.0、Pydantic 2.14.4、pydantic-settings 2.16.3 |
| テスト | pytest 9.2.0、HTTPX2 2.16.2（TestClient 用） |
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

ブラウザーで Web を開くと「開発環境は正常に起動しています。」と表示され、API の表示が「接続確認中」から「正常接続」に変わります。通信に失敗した場合は API の起動とポートを確認し、「再確認」を押してください。各サーバーは起動したターミナルの Ctrl+C で停止できます。

```powershell
Invoke-RestMethod http://localhost:8000/api/v1/health | ConvertTo-Json -Compress
# {"status":"ok","service":"brain-forge-api"}
```

CORS は `http://localhost:5173` と `http://127.0.0.1:5173` からの GET を許可します。Vite は 5173 番が使用中なら起動を停止します。開発ポートを変更する場合は `apps/web/vite.config.ts` と `apps/api/app/main.py` の許可オリジンを合わせてください。[FastAPI の CORS 設定](https://fastapi.tiangolo.com/tutorial/cors/)

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
| `apps/api/.env.local` | `SUPABASE_URL` | 将来のサーバー側接続用の Project URL |
| 同上 | `SUPABASE_SECRET_KEY` | サーバー専用のシークレットキー。権限が必要な API を実装する段階で設定 |

Web は URL と公開キーがそろうとクライアントを初期化します。「設定済み」は初期化の成功を表します。どちらかが空欄なら「接続未設定」、初期化できない値なら「設定エラー」と表示します。API は未設定を起動ログに記録します。ヘルスチェックは Supabase の設定に依存しません。

`VITE_` の値はビルド成果物に含まれます。シークレットキーと旧 `service_role` キーはサーバー側だけで管理してください。Git には値が空の `.env.example` を含め、実際の `.env`・`.env.local` は除外します。[Vite の環境変数](https://vite.dev/guide/env-and-mode) · [Supabase の API キー](https://supabase.com/docs/guides/api/api-keys)

## 品質チェック

| コマンド | 確認内容 |
| --- | --- |
| `pnpm.cmd lint` | ESLint。警告も失敗として扱う |
| `pnpm.cmd typecheck` | TypeScript の strict 型チェック |
| `pnpm.cmd build` | 型チェックと本番用ビルド。出力は `apps/web/dist` |
| `pnpm.cmd test:api` | pytest。ヘルスチェックの JSON、開発オリジン2件、未許可オリジンの拒否を検証 |

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
| `supabase/migrations` | 次段階で設計する PostgreSQL テーブルと RLS の変更履歴 |
| `docs` | 設計資料。基盤構築時点では `mvp-design.md` は未提供 |

## 今後の開発予定

まず `docs/mvp-design.md` に最初の学習ステージの設備、操作、観察できる結果、達成条件を定めます。その仕様からゲーム状態とステージ定義を作り、最小の 2D 表示で観察から実験までを試せるようにします。進捗保存の要件が固まった段階で匿名認証、テーブル、RLS を設計します。3D 表示、自動化プログラミング、シミュレーションの Web Worker 化はその後の拡張候補です。
