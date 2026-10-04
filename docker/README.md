# CookieCloud Docker 使用文档

镜像：[`wzyuliyang911/cookiecloud`](https://hub.docker.com/r/wzyuliyang911/cookiecloud)

源码：[`yuliyang2023/CookieCloud`](https://github.com/yuliyang2023/CookieCloud)

CookieCloud 用于将浏览器 Cookie 和 LocalStorage 同步到自建服务端。本镜像支持原有加密协议、内网明文模式、查询所有 UUID，以及批量清理 Cookie，可配合本仓库的 Chrome 插件使用。

## 镜像标签

| 标签 | 说明 |
| --- | --- |
| `latest` | 最新发布镜像 |
| `4f6b0ae` | 固定到源码提交 `4f6b0ae` 的镜像，便于固定版本部署 |

当前发布镜像的架构为 **`linux/amd64`**，容器服务端端口为 **`8088`**。

## 快速部署

```bash
mkdir -p data

docker pull wzyuliyang911/cookiecloud:latest

docker run -d \
  --name cookiecloud \
  --restart unless-stopped \
  -p 8088:8088 \
  -v "$(pwd)/data:/data/api/data" \
  wzyuliyang911/cookiecloud:latest
```

浏览器插件的服务器地址填写：

```text
http://服务器内网IP:8088
```

例如服务器地址为 `192.168.1.100` 时，填写 `http://192.168.1.100:8088`。

验证启动：

```bash
curl http://127.0.0.1:8088/
docker logs --tail 100 cookiecloud
```

根路径返回类似 `Hello World!API ROOT = ` 即表示服务已响应。本镜像没有独立的 `/health` 接口。

## 使用 Docker Compose

创建 `compose.yaml`：

```yaml
services:
  cookiecloud:
    image: wzyuliyang911/cookiecloud:latest
    container_name: cookiecloud
    restart: unless-stopped
    ports:
      - "8088:8088"
    volumes:
      - ./data:/data/api/data
```

启动及查看日志：

```bash
docker compose up -d
docker compose logs --tail 100 cookiecloud
```

如需固定版本，将镜像标签改为 `wzyuliyang911/cookiecloud:4f6b0ae`。

## 端口、路径与数据保存

| 项目 | 配置 |
| --- | --- |
| 容器内部端口 | 固定为 `8088` |
| 数据目录 | `/data/api/data` |
| 数据文件 | 每个 UUID 对应一个 `<UUID>.json` 文件 |
| 环境变量 `API_ROOT` | 可选，设置接口路径前缀，例如 `/cookie` |
| 日志 | 输出到容器标准输出，使用 `docker logs` 查看 |

必须挂载数据目录，才能在删除、重建容器后保留记录。备份时复制宿主机的 `data` 目录即可；需要一致的备份时，先停止浏览器上传及容器。

宿主机端口被占用时，可使用 `-p 18088:8088`，插件地址相应改为 `http://服务器IP:18088`。容器端口不通过 `PORT` 环境变量修改。

指定接口前缀的部署示例：

```bash
docker run -d \
  --name cookiecloud \
  --restart unless-stopped \
  -e API_ROOT=/cookie \
  -p 8088:8088 \
  -v "$(pwd)/data:/data/api/data" \
  wzyuliyang911/cookiecloud:latest
```

此时插件服务器地址填写 `http://服务器IP:8088/cookie`，接口也都带 `/cookie` 前缀。

## Chrome 插件设置

使用本仓库的 Chrome 插件，推荐使用 **v1.0.6 或更新版本**。

1. 打开 `chrome://extensions`，开启开发者模式，加载已解压的插件目录。
2. 点击插件图标进入设置标签页，填写服务器地址和 UUID。
3. 选择工作模式与加密方式，点击「保存」。未保存的设置仅作为草稿保留。
4. 点击「手动同步」验证连接；设置页会显示预计下次自动上传或下载时间。

| 工作模式 | 行为 |
| --- | --- |
| 上传到服务器 | 将当前浏览器 Cookie 和选择的 LocalStorage 上传到该 UUID |
| 覆盖到浏览器 | 从服务器读取该 UUID 的数据，写入当前浏览器 |
| 暂停同步 | 停止自动同步 |

### 加密方式

| 选项 | 协议值 | 密码要求 |
| --- | --- | --- |
| CryptoJS 动态 IV | `legacy` | 必填 |
| AES-128-CBC 固定 IV | `aes-128-cbc-fixed` | 必填 |
| 不加密（明文） | `none` | 可留空 |

加密模式在插件端加密后上传。明文模式下，Cookie 和 LocalStorage 以 JSON 明文传输、保存，仅用于可信内网。

切换加密方式后需要重新上传，已有数据不会自动转换。

### 查询、修改与删除

在插件设置页点击「查询 / 刷新全部记录」，可查看服务器所有 UUID，按 UUID、域名、名称或值搜索 Cookie。加密记录使用当前填写的密码解密，不同密码的记录需分别查询。

每条 Cookie 提供「修改值」和「删除」：

- 修改或删除操作会保留其他 Cookie、LocalStorage 和原有加密方式。
- 保存前读取最新记录，合并无关更新；目标 Cookie 的值也发生变化时提示冲突。
- 修改当前 UUID 的 Cookie 时，在上传模式下默认勾选「同时更新当前浏览器的 Cookie」，防止下次上传用本地旧值覆盖服务端修改。
- 单条删除仅删除服务端记录，当前浏览器里的 Cookie 仍保留。
- 主机 Cookie 与域 Cookie 分别显示为「仅当前主机」与「域及子域」，可按范围选择目标。

### 清空服务端全部 Cookie

点击「清空服务端全部 Cookie」，核对服务器地址后确认执行。

清理会遍历所有 UUID，清空 Cookie 并保留 UUID 记录、LocalStorage、其他字段和原有加密方式。加密记录使用当前密码，无法解密或读取的记录会保留，并显示在跳过列表中。

清理服务端不会删除浏览器本地 Cookie。浏览器继续自动上传时，服务端可能重新出现 Cookie；需要保持清空状态时，应暂停上传。

## HTTP API

### 服务端 Session Alive 保活

此功能需要部署包含最新源码的服务端，旧镜像没有保活任务接口。可在 `docker` 目录执行 `docker build -t cookiecloud-session-alive .` 构建镜像，再按前面的部署方式使用该镜像并保留原数据挂载。

先在插件上传登录 Cookie，然后在「服务端 Session Alive 保活」中填写 `https://example.com/account|10`，点击「保存并启用服务端保活」。服务端每 30 秒检查到期任务，使用当前 UUID 的最新 Cookie 发起 GET，处理响应 Set-Cookie 并更新该 UUID，保留其他 Cookie、LocalStorage 和加密方式。关闭浏览器后任务继续运行；插件不执行保活。

任务独立于插件同步模式，需在该区域单独停用。加密记录需把解密密码提供给服务端，任务凭据以 AES-256-GCM 保存于挂载的数据目录中的 `.keep-alive` 子目录。备份时包含该目录的任务和密钥文件；状态接口不返回密码。

服务端不执行网页 JavaScript，HTTP 成功不代表仍然登录；网站是否续期由其会话策略决定。普通容器、隐私容器和分区 Cookie 不会混入同一请求。浏览器自动上传可能覆盖服务端续期后的 Cookie，按需求选择同步方向。

`POST /keep-alive/:uuid` 保存任务：

```json
{
  "password": "此UUID的解密密码，明文记录可留空",
  "enabled": true,
  "rules": [{ "url": "https://example.com/account", "interval": 10 }]
}
```

每个 UUID 最多 50 个地址，间隔为 1 至 10080 分钟。`GET /keep-alive/:uuid` 查询任务的启用状态、最近执行时间、HTTP 状态或错误和下次执行时间。提交 `{ "enabled": false }` 停止该 UUID 的任务并删除保存的凭据。接口遵守 `API_ROOT` 前缀，保活地址可为可信内网网站；任务管理接口应沿用服务端的受限访问方式。

以下路径以未设置 `API_ROOT` 为例。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/` | 验证服务是否响应 |
| POST | `/update` | 写入某个 UUID 的完整记录 |
| GET / POST | `/get/:uuid` | 读取某个 UUID 的记录 |
| GET | `/records` | 查询所有 UUID 的上传记录 |
| POST | `/records/clear-cookies` | 清空各 UUID 的 Cookie，保留 LocalStorage |
| GET / POST | `/keep-alive/:uuid` | 查询、启用或停用服务端保活任务 |

### 上传明文记录

以下示例会创建或覆盖 `demo-uuid` 的记录：

```bash
curl -X POST http://127.0.0.1:8088/update \
  -H 'Content-Type: application/json' \
  --data '{
    "uuid": "demo-uuid",
    "crypto_type": "none",
    "encrypted": "{\"cookie_data\":{\"example.com\":[{\"name\":\"demo\",\"value\":\"test\",\"domain\":\"example.com\",\"path\":\"/\",\"hostOnly\":true}]},\"local_storage_data\":{}}"
  }'
```

成功返回 `{"action":"done"}`。`encrypted` 在明文模式下仍使用同一字段名，内容是未加密的 JSON 字符串；加密模式下则为密文。

`/update` 是完整记录覆盖接口。编辑时可传入 `expected_encrypted`，其值为此前读取的原始字符串；记录已变化或已不存在时返回 HTTP `409`，避免覆盖新上传的数据。

### 读取记录

```bash
curl http://127.0.0.1:8088/get/demo-uuid
curl http://127.0.0.1:8088/records
```

`/get/:uuid` 返回 `encrypted` 和 `crypto_type`。不存在的 UUID 返回 HTTP `404`。

对加密记录，可通过 POST 在请求体中提交密码，让服务端解密后返回数据：

```bash
curl -X POST http://127.0.0.1:8088/get/demo-uuid \
  -H 'Content-Type: application/json' \
  --data '{"password":"替换为此UUID的密码"}'
```

`/records` 返回格式：

```json
{
  "records": [
    {
      "uuid": "demo-uuid",
      "crypto_type": "none",
      "encrypted": "..."
    }
  ]
}
```

损坏的记录返回其 UUID 和 `error`，不影响其他记录列出。

### 批量清理 Cookie

**以下命令会清理所有能读取、解密的 UUID 的 Cookie。请先备份，确认目标服务器。**

```bash
curl -X POST http://127.0.0.1:8088/records/clear-cookies \
  -H 'Content-Type: application/json' \
  --data '{"confirm":"clear-all-cookies","password":""}'
```

明文记录可使用空密码；清理加密记录时，将空密码替换为对应的加密密码。

缺少确认标记返回 HTTP `400`，不会清理数据。结果示例：

```json
{
  "action": "done",
  "cleared_uuids": 2,
  "deleted_cookies": 10,
  "skipped": []
}
```

`skipped` 非空表示仍有记录未清理，通常需要换用对应密码重试。

## 更新镜像

使用 Docker Compose：

```bash
docker compose pull
docker compose up -d
```

使用 `docker run` 部署时，先拉取新镜像，停止并删除旧容器，再用原来的端口、环境变量和数据挂载参数重新创建。删除容器前确认数据目录已挂载。

## 访问范围

当前镜像没有内置身份认证，拥有服务访问权限的人可以查询所有 UUID、上传覆盖记录及调用清理接口。确认标记用于防止误操作，不是身份认证。

建议部署在可信内网；需要远程访问时，通过 VPN 或带身份认证和 HTTPS 的反向代理接入。明文模式下应同时限制服务端访问范围和宿主机数据目录访问权限。

HTTPS 保活默认校验证书。对于证书链不完整的可信地址，可在插件勾选该地址的“不校验 HTTPS 证书”后保存任务，或在该规则中设置 `verify_tls: false`。此时请求无法验证服务器身份；例外仅适用于该规则的原始源，跨源重定向仍校验证书，不影响其他任务和插件同步。
