# You and Me

一个部署在 GitHub Pages 上的双人私密空间。网页和加密照片位于 `main` 分支，聊天、语音、日常和愿望以 AES-GCM 密文保存在自动创建的 `space-data` 分支。

登录只需要选择账号并输入空间暗号。Cloudflare Worker 负责隐藏 GitHub Token，并代替网页读写仓库。

## 1. 部署 Cloudflare Worker

1. 在 Cloudflare 控制台进入 `Workers & Pages`，创建一个名为 `you-and-me-sync` 的 Worker。
2. 将 `worker/src/index.js` 的全部代码粘贴到 Worker 编辑器并部署。
3. 进入 Worker 的 `Settings > Variables and Secrets`，添加以下两个 Secret：
   - `GITHUB_TOKEN`：Fine-grained personal access token。
   - `SPACE_PASSCODE_HASH`：`e3bae8b911c20ede90e10e4331ab61d4af8d4337015381c9bf1bdc4f63b31f04`
4. `GITHUB_TOKEN` 的 Repository access 只选择 `yaya-abcd/You-and-Me`，Repository permissions 中仅将 `Contents` 设置为 `Read and write`。
5. 复制部署完成后的 `https://...workers.dev` 地址。

不要把 GitHub Token 写入任何代码、GitHub 文件或聊天消息中。

## 2. 配置网页

打开 `config.js`，将 `PASTE_YOUR_WORKER_URL_HERE` 替换为 Worker 地址，例如：

```js
window.ONLY_US_CONFIG = {
  syncApiUrl: "https://you-and-me-sync.example.workers.dev",
};
```

地址末尾不需要 `/`。

## 3. 发布 GitHub Pages

将以下内容上传到仓库 `yaya-abcd/You-and-Me` 的 `main` 分支根目录：

- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `README.md`
- `.nojekyll`
- `private-vault` 文件夹及其全部文件
- `worker` 文件夹及其全部文件

然后进入仓库 `Settings > Pages`，在 `Build and deployment` 中选择 `Deploy from a branch`，分支选择 `main`，目录选择 `/ (root)`。

发布地址：`https://yaya-abcd.github.io/You-and-Me/`

## 数据存储

- 第一次登录时，Worker 会自动创建 `space-data` 分支。
- 运行数据加密保存为 `state.secure`，不使用 IndexedDB、localStorage 或 sessionStorage。
- 双方在线时，网页每 3 秒检查一次远程更新。
- 单个语音、照片或视频附件上限为 8MB。
- 仓库中的 `.photo` 和 `.secure` 文件不能直接作为照片、语音或聊天记录打开。
