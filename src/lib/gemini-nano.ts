// 声明各种可能的实验性 API 接口
declare global {
  var LanguageModel: any;
  var ai: any;
  interface Window {
    ai: any;
  }
}

/**
 * 寻找可用的本地 Gemini 接口
 */
export async function getGeminiNanoSession() {
  try {
    // 1. 尝试最新的 LanguageModel API (你刚刚跑通的那个)
    if (typeof LanguageModel !== 'undefined' && LanguageModel.create) {
      console.log('Detected: Modern LanguageModel API');
      return await LanguageModel.create({
        expectedOutputLanguage: 'en' // 消除那个语言警告
      });
    }

    // 2. 尝试 ai.languageModel 规范
    if (typeof ai !== 'undefined' && ai.languageModel) {
      console.log('Detected: ai.languageModel API');
      return await ai.languageModel.create();
    }

    // 3. 尝试旧版 window.ai 规范
    if (typeof window !== 'undefined' && window.ai && window.ai.createTextSession) {
      const canCreate = await window.ai.canCreateTextSession();
      if (canCreate === 'readily') {
        console.log('Detected: Legacy window.ai API');
        return await window.ai.createTextSession();
      }
    }
  } catch (e) {
    console.warn('Local Gemini detection failed:', e);
  }
  return null;
}

/**
 * 云端 Fallback
 */
async function generateContentViaCloud(prompt: string) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const apiUrl = import.meta.env.VITE_GEMINI_API_URL || 'https://ai.chen.rs/v1/chat/completions';

  console.log('Using Cloud Gemini Fallback (ai.chen.rs)...');

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gemini-1.5-flash",
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Cloud Gemini Error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

export async function generateContent(prompt: string) {
  const session = await getGeminiNanoSession();
  
  if (session) {
    try {
      console.log('🚀 Running on Local Gemini Nano...');
      // 兼容新旧 prompt 调用
      const result = await (session.prompt ? session.prompt(prompt) : session.execute(prompt));
      // 如果返回的是流或者对象，尝试提取文本
      return typeof result === 'string' ? result : (result.text || JSON.stringify(result));
    } catch (e) {
      console.error('Local Gemini execution failed, falling back to cloud:', e);
      return await generateContentViaCloud(prompt);
    } finally {
      if (session.destroy) session.destroy();
    }
  } else {
    return await generateContentViaCloud(prompt);
  }
}
