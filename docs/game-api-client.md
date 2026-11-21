# M4-2 ゲーム API クライアント

`apps/web/src/services/gameApi.ts` は、FastAPI の OpenAPI から生成した `paths` と `openapi-fetch` を使います。HTTP メソッド、パスパラメーター、JSON の送受信型は生成された契約に従います。公開ヘルスチェックは `health.ts` から利用でき、ゲーム API と接続先の設定を共有します。

## 契約型の更新

`packages/contracts/openapi.json` は FastAPI が出力する OpenAPI のスナップショットです。スキーマと生成された `openapi.d.ts` は Git で追跡する対象です。型の再生成は依存関係をインストール済みなら、FastAPI の起動やネット接続なしで行えます。

```powershell
# API のスキーマを変更した場合だけ、先にスナップショットを更新する
pnpm.cmd contracts:export
pnpm.cmd contracts:generate
```

`pnpm.cmd typecheck` は保存済みスキーマと生成型の一致を確認し、その型を使って Web を型チェックします。FastAPI の現在のコードとスナップショットが一致するか確認するには `pnpm.cmd contracts:export --check` を使います。このコマンドもサーバーの起動は不要です。

設計書の `{id}` は実際の OpenAPI では `{attempt_id}` です。スキャン本文では `index`、`action_id`、`expected_step` がすべて必須です。公開ステージ情報の `GET /api/v1/stages/ST-001` は現在のスキーマに含まれていません。OpenAPI は標準の入力検証エラーを宣言しています。既存ルートの認証・競合などのエラーは、実際に返る HTTP ステータスと既知のエラーコードで扱います。

## 認証とエラー

初回の匿名サインインとセッション復元には `ensureSupabaseSession()` を使います。ゲーム API クライアントは保護リクエストのたびに同じ Supabase クライアントから最新のセッションを取得し、アクセストークンを `Authorization: Bearer` ヘッダーに付けます。セッションがなければ `authentication_required` を返します。401 を受けた場合は同じユーザーの更新済みセッションを確認するか、セッションを1回更新し、新しいトークンで元のリクエストを1回だけ再送します。

呼び出し元は `GameApiError.kind` を表示文言に対応付けます。HTTP 応答がある場合は `status`、既知の識別子がある場合は `code` を参照できます。入力検証エラーの本文や通信例外の内部情報は保持しません。

- `retryable` は、同じ操作を安全に再試行できる一時的な失敗を示します。作成リクエストの応答が途切れた場合は、新しい挑戦がすでに作成されている可能性があるため `retryable` は `false` です。
- `outcomeUnknown` が `true` の場合、変更を伴う処理はサーバーで完了している可能性があります。タイムアウト表示と、ゲーム上の検品結果は区別します。
- `conflict` の場合は `getAttempt()` で最新状態を取得します。古い操作に新しい `expected_step` を上書きせず、必要なら新しい検品操作を作ります。

## M4-3 の工場画面

`useInspection.ts` はセッション確立後に `gameApi` を呼び、サーバーの挑戦状態を画面に渡します。画面番号から `1` を引く変換は、検品操作を作るときに行います。

```typescript
await ensureSupabaseSession()
const attempt = await gameApi.createAttempt({ stage_id: 'ST-001' })
const operation = gameApi.createScanOperation(attempt.id, selectedNumber - 1, attempt.scans_used)
const result = await gameApi.scanContainer(operation)
```

`createScanOperation()` は標準の UUID 生成機能を使い、挑戦 ID、箱の添字、手順番号、`action_id` を固定します。送信中に同じ操作を呼ぶと同一の Promise が返ります。応答が途切れた場合は操作オブジェクトを保持し、再試行でも同じオブジェクトを `scanContainer()` に渡します。再送で返るのは元の検品時点の応答なので、最新状態が必要な場合は `getAttempt()` で取得します。別の箱を検品するときは新しい操作を作ります。

ブラウザーには API 接続先、ステージ、ユーザーに対応する挑戦 ID を保存します。再読み込みではサーバーから検品履歴を再取得します。結果不明の検品で「状態を確認」を選び、サーバーの手順が進んでいなければ、同じ検品を再送する操作を保持します。演出のスキップは描画だけを終了し、通信の完了を待って結果を表示します。

挑戦作成 API には検品と同じ再送用 ID がありません。作成後に応答が途切れた場合、ID が分からないため、その作成結果は画面から取得できません。画面は結果不明と表示し、新しい挑戦の作成はユーザーが選択します。
