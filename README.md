# MD Atelier

配布しやすい静的構成の Markdown ビュアー・エディタ PWA です。

## できること

- Markdown の編集とライブプレビュー
- `.md` / `.markdown` / `.txt` の読み込み
- File System Access API 対応ブラウザでの直接保存
- 非対応ブラウザ向けのダウンロード保存
- ブラウザ機能検出による Chrome / Edge / Safari 向け保存方式の自動切り替え
- Chrome / Edge の内蔵 Translator API 対応環境での Markdown 翻訳
- HTML エクスポート
- オフライン起動
- ライト/ダークテーマ

## ブラウザ別の動き

- Chrome / Edge: File System Access API が使える環境では直接保存します。Translator API が有効な環境では、コードブロックを残したまま Markdown 本文を翻訳できます。
- Safari / Firefox: ファイルは通常の選択 UI で読み込み、保存はダウンロード保存に切り替わります。Translator API がない場合は翻訳ボタンを無効化します。

## ローカル実行

```sh
node scripts/server.mjs
```

または任意の静的サーバーでこのフォルダを配信してください。PWA の service worker は `file://` では動かないため、`http://localhost` で確認します。
