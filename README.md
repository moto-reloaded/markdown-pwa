# MD Atelier

配布しやすい静的構成の Markdown ビュアー・エディタ PWA です。

## できること

- Markdown の編集とライブプレビュー
- `.md` / `.markdown` / `.txt` の読み込み
- File System Access API 対応ブラウザでの直接保存
- 非対応ブラウザ向けのダウンロード保存
- HTML エクスポート
- オフライン起動
- ライト/ダークテーマ

## ローカル実行

```sh
node scripts/server.mjs
```

または任意の静的サーバーでこのフォルダを配信してください。PWA の service worker は `file://` では動かないため、`http://localhost` で確認します。
