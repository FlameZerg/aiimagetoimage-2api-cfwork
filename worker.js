/**
 * =================================================================================
 * 项目: aiimagetoimage-2api (Cloudflare Worker 终极行为复刻版)
 * 版本: 1.7.0 (代号: Chimera Reborn - Absolute Stealth)
 * 修复: 1. 彻底修复 429 识别问题 2. 修复 JSON 解析错误 3. 恢复全功能驾驶舱 UI
 * =================================================================================
 */

const CONFIG = {
  PROJECT_NAME: "aiimagetoimage-2api",
  PROJECT_VERSION: "1.7.0",
  API_MASTER_KEY: "1", 

  // 上游地址
  UPSTREAM_ORIGIN: "https://aiimagetoimage.io",
  GENERATE_ENDPOINT: "https://api.aiimagetoimage.io/api/img2img/image-generate/image2image",
  STATUS_ENDPOINT: "https://api.aiimagetoimage.io/api/result/get",
  ASSETS_PRELOAD_URL: "https://aiimagetoimage.io/assets/image/home/demo3.png",
  GA_ENDPOINT: "https://region1.google-analytics.com/g/collect",

  // 模型配置
  MODELS: [
    { id: "nano_banana", name: "Nano Banana (快速/推荐)" },
    { id: "standard", name: "Standard (标准)" }
  ],
  DEFAULT_MODEL: "nano_banana",
  ASPECT_RATIOS: ["match_input_image", "1:1", "3:2", "2:3", "9:16", "16:9", "3:4", "4:3"],
  POLLING_TIMEOUT: 300000, 
};

// --- [第一部分: 身份与指纹伪装引擎] ---

class IdentityManager {
  /**
   * 生成随机浏览器指纹 (模拟无痕模式)
   */
  static createIdentity() {
    // 随机化 Chrome 小版本号，模拟不同用户
    const chromeVersion = `143.0.${Math.floor(Math.random() * 9999)}.${Math.floor(Math.random() * 999)}`;
    
    return {
      headers: {
        "accept": "*/*",
        "accept-encoding": "gzip, deflate, br, zstd",
        "accept-language": "zh-CN,zh;q=0.9",
        "origin": "https://aiimagetoimage.io",
        "priority": "u=1, i",
        "referer": "https://aiimagetoimage.io/",
        "sec-ch-ua": `"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"`,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
        // 注意：绝对不发送 X-Forwarded-For，避免暴露代理身份
      }
    };
  }

  /**
   * 模拟 Google Analytics 行为
   */
  static async simulateGA(identity) {
    const cid = `${Math.floor(Math.random() * 1000000000)}.${Math.floor(Date.now() / 1000)}`;
    const params = new URLSearchParams({
      v: "2",
      tid: "G-QN0ECG686N",
      gtm: "45je5ca1v9229895114za200zd9229895114",
      _p: Date.now().toString(),
      cid: cid,
      ul: "zh-cn",
      sr: "1920x1080",
      en: "page_view",
      dl: "https://aiimagetoimage.io/",
      dt: "FREE AI Image to Image Generator: Pro Edits via Text Prompt"
    });

    try {
      await fetch(`${CONFIG.GA_ENDPOINT}?${params.toString()}`, {
        method: "POST",
        headers: {
          ...identity.headers,
          "sec-fetch-mode": "no-cors",
          "sec-fetch-site": "cross-site"
        }
      });
    } catch (e) {}
  }

  /**
   * 模拟静态资源预加载
   */
  static async preload(identity) {
    try {
      await fetch(CONFIG.ASSETS_PRELOAD_URL, {
        method: "GET",
        headers: {
          ...identity.headers,
          "sec-fetch-dest": "image",
          "sec-fetch-mode": "no-cors"
        }
      });
    } catch (e) {}
  }
}

// --- [第二部分: 核心业务逻辑] ---

async function submitTaskWithSimulation(prompt, imageBlob, model, ratio, logCallback) {
  const identity = IdentityManager.createIdentity();
  
  await logCallback("DEBUG", `>>> [Identity] 模拟全新无痕浏览器指纹已就绪`);
  
  // 行为模拟 1: 访问首页并加载资源
  await logCallback("DEBUG", `>>> [Handshake] 模拟首页访问与资源预加载...`);
  await IdentityManager.preload(identity);
  
  // 行为模拟 2: 发送 GA 统计 (关键：让上游认为你是真实访客)
  await logCallback("DEBUG", `>>> [Handshake] 模拟 Google Analytics 埋点上报...`);
  await IdentityManager.simulateGA(identity);
  
  // 模拟人类操作延迟
  await new Promise(r => setTimeout(r, 1500));

  // 构造 Multipart 请求
  const formData = new FormData();
  if (imageBlob) {
    const finalBlob = new Blob([await imageBlob.arrayBuffer()], { type: "image/jpeg" });
    formData.append("image", finalBlob, "产品1.jpg");
    await logCallback("DEBUG", `>>> [Payload] 图片已封装 (Size: ${finalBlob.size} bytes)`);
  }
  
  formData.append("prompt", prompt || "High quality");
  formData.append("negative_prompt", "");
  formData.append("model_type", model || CONFIG.DEFAULT_MODEL);
  formData.append("aspect_ratio", ratio || "match_input_image");

  await logCallback("DEBUG", `>>> [UPSTREAM_REQUEST] 正在提交任务到上游接口...`);

  const response = await fetch(CONFIG.GENERATE_ENDPOINT, {
    method: "POST",
    headers: identity.headers,
    body: formData
  });

  const responseText = await response.text();
  await logCallback("DEBUG", `<<< [UPSTREAM_RESPONSE] Status: ${response.status}`);
  await logCallback("DEBUG", `<<< [UPSTREAM_RESPONSE] Body: ${responseText}`);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    throw new Error(`上游响应解析失败: ${responseText.substring(0, 100)}`);
  }

  if (data.code !== 200) {
    if (data.code === 429) {
      throw new Error("上游触发 429 限制。原因：Cloudflare 节点 IP 已达今日上限。请尝试更换 Worker 区域或稍后再试。");
    }
    throw new Error(`上游业务错误: ${JSON.stringify(data.message)}`);
  }

  return { jobId: data.result.job_id, identity };
}

// --- [第三部分: Worker 路由与接口适配] ---

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const apiKey = env.API_MASTER_KEY || CONFIG.API_MASTER_KEY;

    // 处理跨域
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*"
        }
      });
    }

    // 首页 UI
    if (url.pathname === '/') return handleUI(request, apiKey);
    
    // 鉴权
    const auth = request.headers.get("Authorization");
    if (apiKey !== "1" && auth !== `Bearer ${apiKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    // 模型列表
    if (url.pathname === '/v1/models') {
      return new Response(JSON.stringify({
        object: "list",
        data: CONFIG.MODELS.map(m => ({ id: m.id, object: "model", created: Date.now(), owned_by: "aiimagetoimage" }))
      }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    // Chat 接口 (适配 Vision)
    if (url.pathname === '/v1/chat/completions') return handleChat(request, ctx);
    
    // 状态查询代理
    if (url.pathname === '/v1/query/status') return handleStatusProxy(request);

    return new Response("Not Found", { status: 404 });
  }
};

async function handleStatusProxy(request) {
  const jobId = new URL(request.url).searchParams.get("job_id");
  const identity = IdentityManager.createIdentity();
  const response = await fetch(`${CONFIG.STATUS_ENDPOINT}?job_id=${jobId}`, {
    headers: identity.headers
  });
  return new Response(response.body, { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}

async function handleChat(request, ctx) {
  const body = await request.json();
  const messages = body.messages || [];
  const lastMsg = messages[messages.length - 1];
  const isWebUI = body.is_web_ui === true;

  let prompt = "";
  let imageBlob = null;

  // 解析多模态内容
  if (Array.isArray(lastMsg.content)) {
    for (const part of lastMsg.content) {
      if (part.type === 'text') prompt += part.text;
      if (part.type === 'image_url') {
        const res = await fetch(part.image_url.url);
        imageBlob = await res.blob();
      }
    }
  } else {
    prompt = lastMsg.content;
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const logToClient = async (tag, msg) => {
    const data = { debug_log: { tag, msg } };
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  ctx.waitUntil((async () => {
    try {
      const { jobId, identity } = await submitTaskWithSimulation(
        prompt, 
        imageBlob, 
        body.model, 
        body.aspect_ratio, 
        logToClient
      );

      if (isWebUI) {
        // Web 模式：直接返回 JobID 让前端轮询
        await writer.write(encoder.encode(`data: ${JSON.stringify({ job_id: jobId, status: "submitted" })}\n\n`));
      } else {
        // API 模式：Worker 内部轮询
        let completed = false;
        let startTime = Date.now();
        while (!completed && Date.now() - startTime < CONFIG.POLLING_TIMEOUT) {
          const statusRes = await fetch(`${CONFIG.STATUS_ENDPOINT}?job_id=${jobId}`, { headers: identity.headers });
          const statusData = await statusRes.json();
          if (statusData.code === 200 && statusData.result?.image_url) {
            const url = statusData.result.image_url[0];
            const chunk = { 
              id: `chatcmpl-${crypto.randomUUID()}`, 
              object: "chat.completion.chunk", 
              choices: [{ delta: { content: `![Generated Image](\${url})` }, finish_reason: "stop" }] 
            };
            await writer.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            completed = true;
          } else {
            await new Promise(r => setTimeout(r, 3000));
          }
        }
      }
    } catch (e) {
      await logToClient("ERROR", e.message);
      await writer.write(encoder.encode(`data: ${JSON.stringify({ error: { message: e.message } })}\n\n`));
    } finally {
      await writer.write(encoder.encode("data: [DONE]\n\n"));
      await writer.close();
    }
  })());

  return new Response(readable, { headers: { "Content-Type": "text/event-stream", "Access-Control-Allow-Origin": "*" } });
}

// --- [第四部分: 开发者驾驶舱 UI (全功能版)] ---

function handleUI(request, apiKey) {
  const origin = new URL(request.url).origin;
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${CONFIG.PROJECT_NAME} - 终极驾驶舱</title>
    <style>
        :root {
            --bg: #0D0D0D; --panel: #161616; --border: #262626; --text: #E5E5E5;
            --primary: #FFBF00; --success: #4ADE80; --error: #F87171;
        }
        body { font-family: 'Inter', system-ui, sans-serif; background: var(--bg); color: var(--text); margin: 0; height: 100vh; display: flex; overflow: hidden; }
        .sidebar { width: 400px; background: var(--panel); border-right: 1px solid var(--border); padding: 24px; display: flex; flex-direction: column; overflow-y: auto; }
        .main { flex: 1; display: flex; flex-direction: column; padding: 24px; background: #000; }
        
        .card { background: #1F1F1F; padding: 16px; border-radius: 12px; border: 1px solid var(--border); margin-bottom: 16px; }
        .label { font-size: 11px; color: #737373; margin-bottom: 8px; display: block; font-weight: bold; text-transform: uppercase; }
        .code-block { font-family: monospace; font-size: 12px; color: var(--primary); background: #000; padding: 10px; border-radius: 6px; word-break: break-all; border: 1px solid #333; }
        
        input, select, textarea { width: 100%; background: #262626; border: 1px solid #333; color: #fff; padding: 10px; border-radius: 6px; margin-bottom: 10px; box-sizing: border-box; }
        button { width: 100%; padding: 12px; background: var(--primary); border: none; border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s; }
        button:hover { filter: brightness(1.1); }
        button:disabled { background: #444; cursor: not-allowed; }

        .upload-area { border: 2px dashed #444; border-radius: 8px; padding: 20px; text-align: center; cursor: pointer; margin-bottom: 10px; position: relative; }
        #preview { max-width: 100%; max-height: 200px; display: none; margin: 0 auto; border-radius: 4px; }

        .terminal { flex: 1; background: #050505; border: 1px solid var(--border); border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; }
        .terminal-header { background: #1A1A1A; padding: 10px 20px; border-bottom: 1px solid var(--border); font-size: 12px; display: flex; justify-content: space-between; }
        .output { flex: 1; padding: 20px; overflow-y: auto; font-family: monospace; font-size: 13px; line-height: 1.6; }
        .log-item { margin-bottom: 6px; border-left: 2px solid #333; padding-left: 10px; }
        .log-DEBUG { color: #00FF41; }
        .log-ERROR { color: var(--error); }
        
        .progress-container { height: 4px; background: #222; width: 100%; }
        .progress-bar { height: 100%; background: var(--primary); width: 0%; transition: 0.3s; }
        
        .result-img { max-width: 100%; border-radius: 8px; border: 1px solid var(--primary); margin-top: 10px; }
    </style>
</head>
<body>
    <div class="sidebar">
        <h2 style="color:var(--primary); margin-top:0;">🖼️ AI Cockpit <small>v${CONFIG.PROJECT_VERSION}</small></h2>
        
        <div class="card">
            <span class="label">API KEY</span>
            <div class="code-block">${apiKey}</div>
        </div>

        <div class="card">
            <span class="label">配置参数</span>
            <select id="model">
                ${CONFIG.MODELS.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
            </select>
            <select id="ratio">
                ${CONFIG.ASPECT_RATIOS.map(r => `<option value="${r}">${r}</option>`).join('')}
            </select>
            
            <div class="upload-area" onclick="document.getElementById('fileInput').click()">
                <div id="upload-text">点击上传参考图</div>
                <img id="preview">
                <input type="file" id="fileInput" hidden accept="image/*">
            </div>

            <textarea id="prompt" rows="3" placeholder="输入提示词..."></textarea>
            <button id="genBtn">🚀 开始生成 (全链路模拟)</button>
        </div>
    </div>

    <div class="main">
        <div class="terminal">
            <div class="terminal-header">
                <span>TERMINAL OUTPUT</span>
                <span id="status">READY</span>
            </div>
            <div class="output" id="output">
                <div style="color:#555">等待任务提交...</div>
            </div>
            <div class="progress-container"><div class="progress-bar" id="pb"></div></div>
        </div>
    </div>

    <script>
        const API_KEY = "${apiKey}";
        let selectedBlob = null;

        // 图片预览
        document.getElementById('fileInput').onchange = e => {
            const file = e.target.files[0];
            if (file) {
                selectedBlob = file;
                const reader = new FileReader();
                reader.onload = e => {
                    document.getElementById('preview').src = e.target.result;
                    document.getElementById('preview').style.display = 'block';
                    document.getElementById('upload-text').style.display = 'none';
                };
                reader.readAsDataURL(file);
            }
        };

        function addLog(tag, msg) {
            const out = document.getElementById('output');
            const div = document.createElement('div');
            div.className = 'log-item log-' + tag;
            div.innerHTML = \`[\${new Date().toLocaleTimeString()}] [\${tag}] \${msg}\`;
            out.appendChild(div);
            out.scrollTop = out.scrollHeight;
        }

        async function run() {
            const btn = document.getElementById('genBtn');
            const pb = document.getElementById('pb');
            const status = document.getElementById('status');
            const prompt = document.getElementById('prompt').value;

            if (!prompt) return alert("请输入提示词");

            btn.disabled = true;
            document.getElementById('output').innerHTML = '';
            pb.style.width = '10%';
            status.innerText = 'SIMULATING...';

            try {
                let content = [{ type: "text", text: prompt }];
                if (selectedBlob) {
                    const base64 = await new Promise(r => {
                        const reader = new FileReader();
                        reader.onload = () => r(reader.result);
                        reader.readAsDataURL(selectedBlob);
                    });
                    content.push({ type: "image_url", image_url: { url: base64 } });
                }

                const res = await fetch('/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: document.getElementById('model').value,
                        aspect_ratio: document.getElementById('ratio').value,
                        messages: [{ role: 'user', content: content }],
                        is_web_ui: true
                    })
                });

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let jobId = null;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\\n');
                    
                    for (let line of lines) {
                        if (!line.trim() || line === 'data: [DONE]') continue; // 修复解析错误的关键
                        
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.substring(6));
                                if (data.debug_log) addLog(data.debug_log.tag, data.debug_log.msg);
                                if (data.job_id) jobId = data.job_id;
                                if (data.error) throw new Error(data.error.message);
                            } catch (e) {
                                // 忽略非 JSON 行
                            }
                        }
                    }
                }

                if (!jobId) throw new Error("未能获取 JobID，请检查日志。");

                status.innerText = 'POLLING...';
                pb.style.width = '50%';

                // 轮询结果
                while (true) {
                    const poll = await fetch(\`/v1/query/status?job_id=\${jobId}\`, {
                        headers: { 'Authorization': 'Bearer ' + API_KEY }
                    });
                    const pollData = await poll.json();
                    
                    if (pollData.code === 200 && pollData.result?.image_url) {
                        const url = pollData.result.image_url[0];
                        addLog("SUCCESS", "生成成功！");
                        document.getElementById('output').innerHTML += \`<br><img src="\${url}" class="result-img"><br><a href="\${url}" target="_blank" style="color:var(--primary)">点击下载原图</a>\`;
                        pb.style.width = '100%';
                        status.innerText = 'COMPLETED';
                        break;
                    } else if (pollData.code === 202) {
                        addLog("DEBUG", "任务处理中...");
                        pb.style.width = (parseInt(pb.style.width) + 5) + '%';
                    } else {
                        throw new Error("轮询异常: " + JSON.stringify(pollData));
                    }
                    await new Promise(r => setTimeout(r, 3000));
                }

            } catch (e) {
                addLog("ERROR", e.message);
                status.innerText = 'FAILED';
                pb.style.width = '0%';
            } finally {
                btn.disabled = false;
            }
        }

        document.getElementById('genBtn').onclick = run;
    </script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
