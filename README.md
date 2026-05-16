# 大庚剑阵 · 手势御剑

一个可部署的静态网页，用 Three.js 渲染 3D 剑阵，用 MediaPipe Hands 读取摄像头手势。

## 本地预览

```bash
npm start
```

打开 `http://127.0.0.1:5174/`。

## 发布

把这个目录部署到支持 HTTPS 的静态托管平台即可，例如 Vercel、Netlify、Cloudflare Pages 或 GitHub Pages。

摄像头权限需要 HTTPS，`localhost` 也可以；普通公网 HTTP 或局域网 HTTP 在手机上通常不能调用摄像头。

## 手势

- 剑指：旋转剑轮
- 单指：引导剑流，快速挥动会划出剑气
- 捏合：聚剑蓄势，松开万剑齐发
- 开掌：展开天罗剑阵
- 握拳：凝聚剑核
- 食指小指：触发剑雨
- 三指：结印护阵
- 双手：合阵蓄能，合掌触发爆发
