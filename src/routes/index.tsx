'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { GlobalStyle } from '@/types/project-plan';
import { generateContent as generateWithNano } from '@/lib/gemini-nano';
import { generateText, generateImage as generateAiImage, hasApiConfig } from '@/lib/ai-client';
import { exportProjectToPPT, exportToPPT } from '@/lib/ppt-exporter';
import { PPT_STYLES } from '@/lib/ppt-templates';
import type { PlanRecord } from '@/types/plan-record';
import { parseHistory, serializeHistory } from '@/types/plan-record';
import type { ExtendedShootingPlan } from '@/types/single-plan';
import { FileDown, Loader2, Info, Image as ImageIcon, Wand2, ChevronDown, XCircle } from 'lucide-react';
import type { ProjectPlan, OutfitInput, ClientProfile } from '@/types/project-plan';
import { buildProjectTitle } from '@/lib/plan-title';
import { buildProjectPrompt } from '@/lib/project-prompt';
import { normalizeProjectPlan } from '@/lib/project-parser';
import { parseLlmJson } from '@/lib/llm-json';
import SettingsPanel from '@/components/SettingsPanel';
import Sidebar from '@/components/Sidebar';
import TopicChips, { saveRecentTopic } from '@/components/TopicChips';
import PlanToc from '@/components/PlanToc';
import OutfitPlannerForm from '@/components/OutfitPlannerForm';
import GlobalStyleSelector from '@/components/GlobalStyleSelector';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  const [topic, setTopic] = useState('');

  // 3 套服装模式（一次性生成整套项目）
  const [useOutfitMode, setUseOutfitMode] = useState(false);
  const [clientProfile, setClientProfile] = useState<{ age: number | null; gender: '男' | '女' | '不限'; usage?: any }>({
    age: null,
    gender: '不限',
    usage: undefined,
  });
  const [outfits, setOutfits] = useState<any[]>([]);
  const [globalStyle, setGlobalStyle] = useState<GlobalStyle>({
    colorTone: 'neutral',
    lightingMood: 'natural',
    era: 'timeless',
  });
  const [pptStyleId, setPptStyleId] = useState<string>('minimal');
  const [projectPlan, setProjectPlan] = useState<ProjectPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<ExtendedShootingPlan | null>(null);
  const [sceneImages, setSceneImages] = useState<Record<number, string>>({});
  const [, setLoadingImage] = useState<Record<number, boolean>>({});
  const [promptDrafts, setPromptDrafts] = useState<Record<number, string>>({});
  const [history, setHistory] = useState<PlanRecord[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 批量生成队列管理
  const [batchQueue, setBatchQueue] = useState<{ total: number; completed: number; active: boolean }>({
    total: 0,
    completed: 0,
    active: false,
  });
  const batchTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const batchAbortRef = useRef<AbortController | null>(null);

  // 取消批量生成
  const cancelBatchGeneration = useCallback(() => {
    // 清除所有待执行的 timeout
    batchTimeoutsRef.current.forEach((t) => clearTimeout(t));
    batchTimeoutsRef.current = [];
    // 中止正在进行的请求
    batchAbortRef.current?.abort();
    batchAbortRef.current = null;
    // 重置队列状态
    setBatchQueue({ total: 0, completed: 0, active: false });
  }, []);

  // 初始化加载历史记录
  useEffect(() => {
    const savedHistory = localStorage.getItem('shooting_history');
    setHistory(parseHistory(savedHistory));
  }, []);

  // 批量生成完成时重置状态
  useEffect(() => {
    if (batchQueue.active && batchQueue.completed >= batchQueue.total && batchQueue.total > 0) {
      // 延迟一点点再重置，让用户看到完成状态
      const timer = setTimeout(() => {
        setBatchQueue({ total: 0, completed: 0, active: false });
        batchAbortRef.current = null;
        batchTimeoutsRef.current = [];
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [batchQueue]);

  // 防抖保存 visualPrompt（项目模式）
  const saveProjectPrompt = useCallback((lookIdx: number, sceneIdx: number, newPrompt: string) => {
    // 1) 更新当前 projectPlan
    setProjectPlan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        plans: prev.plans.map((pp, li) => {
          if (li !== lookIdx) return pp;
          return {
            ...pp,
            scenes: (pp.scenes || []).map((ss, ssi) => (ssi === sceneIdx ? { ...ss, visualPrompt: newPrompt } : ss)),
          };
        }),
      };
    });

    // 2) 写回 history + localStorage
    setHistory((prevHistory) => {
      const nextHistory = prevHistory.map((r) => {
        if (r.kind === 'project' && r.data.id === projectPlan?.id) {
          return {
            ...r,
            data: {
              ...r.data,
              plans: r.data.plans.map((pp, li) => {
                if (li !== lookIdx) return pp;
                return {
                  ...pp,
                  scenes: (pp.scenes || []).map((ss, ssi) =>
                    ssi === sceneIdx ? { ...ss, visualPrompt: newPrompt } : ss
                  ),
                };
              }),
            },
          };
        }
        return r;
      });
      localStorage.setItem('shooting_history', serializeHistory(nextHistory as PlanRecord[]));
      return nextHistory as PlanRecord[];
    });
  }, [projectPlan?.id]);

  const debouncedSaveProjectPrompt = useDebouncedCallback(saveProjectPrompt, 800);

  // 防抖保存 visualPrompt（单预案模式）
  const saveSinglePrompt = useCallback((sceneIdx: number, newPrompt: string) => {
    // 1) 更新当前展示
    setPlan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scenes: prev.scenes.map((s, idx) => (idx === sceneIdx ? { ...s, visualPrompt: newPrompt } : s)),
      };
    });

    // 2) 写回 history + localStorage
    setHistory((prevHistory) => {
      const nextHistory = prevHistory.map((r) => {
        if (r.kind === 'single' && r.data.id === plan?.id) {
          return {
            kind: 'single',
            data: {
              ...r.data,
              scenes: r.data.scenes.map((s, idx) => (idx === sceneIdx ? { ...s, visualPrompt: newPrompt } : s)),
            },
          } as PlanRecord;
        }
        return r;
      });
      localStorage.setItem('shooting_history', serializeHistory(nextHistory));
      return nextHistory;
    });
  }, [plan?.id]);

  const debouncedSaveSinglePrompt = useDebouncedCallback(saveSinglePrompt, 800);

  // 开启新预案
  const handleNewChat = () => {
    setPlan(null);
    setProjectPlan(null);
    setTopic('');
    setSceneImages({});
    setPromptDrafts({});
  };

  // 切换到历史预案
  const loadHistoryPlan = (record: PlanRecord) => {
    if (record.kind === 'single') {
      setProjectPlan(null);
      setPlan(record.data);
      setTopic(record.data.title);
      setSceneImages({});
      setPromptDrafts({});
    } else {
      setPlan(null);
      setProjectPlan(record.data);
      setTopic(record.title);
      setSceneImages({});
      setPromptDrafts({});
    }
  };

  // 生成参考图（使用可编辑的提示词）
  const generateImage = async (visualPrompt: string, index: number, signal?: AbortSignal) => {
    setLoadingImage((prev) => ({ ...prev, [index]: true }));

    try {
      const prompt = (visualPrompt || '').trim();
      if (!prompt) {
        alert('提示词为空，无法生成。');
        setLoadingImage((prev) => ({ ...prev, [index]: false }));
        return;
      }

      // 检查是否已被取消
      if (signal?.aborted) {
        setLoadingImage((prev) => ({ ...prev, [index]: false }));
        return;
      }

      console.log(`[generateImage] 开始生成 key=${index} 图片...`);
      console.log(`[generateImage] 提示词: ${prompt}`);

      // 使用新的 AI 客户端
      const data = await generateAiImage(prompt);

      // 再次检查是否已被取消
      if (signal?.aborted) {
        setLoadingImage((prev) => ({ ...prev, [index]: false }));
        return;
      }

      let imageUrl: string;
      if (data.imageBase64) {
        const mimeType = data.mimeType || 'image/png';
        imageUrl = `data:${mimeType};base64,${data.imageBase64}`;
      } else {
        throw new Error('未知的响应格式');
      }

      const img = new window.Image();
      img.onload = () => {
        if (!signal?.aborted) {
          setSceneImages((prev) => ({ ...prev, [index]: imageUrl }));
        }
        setLoadingImage((prev) => ({ ...prev, [index]: false }));
        // 更新批量进度
        setBatchQueue((prev) => prev.active ? { ...prev, completed: prev.completed + 1 } : prev);
      };
      img.onerror = () => {
        if (!signal?.aborted) {
          alert('图片加载失败，请重试。');
        }
        setLoadingImage((prev) => ({ ...prev, [index]: false }));
      };
      img.src = imageUrl;

    } catch (error: any) {
      if (signal?.aborted) {
        setLoadingImage((prev) => ({ ...prev, [index]: false }));
        return;
      }
      console.error('[generateImage] 错误:', error);
      alert(`图片生成失败: ${error.message}`);
      setLoadingImage((prev) => ({ ...prev, [index]: false }));
    }
  };

  const handleGenerateProject = async () => {
    if (loading) return;
    if (!clientProfile.age || clientProfile.age <= 0) {
      alert('请先填写客户年龄（精确）。');
      return;
    }
    if (!outfits.length) {
      alert('请至少添加 1 套服装（最多 3 套）。');
      return;
    }

    const cleanedOutfits: OutfitInput[] = (outfits as OutfitInput[])
      .filter((o) => o && o.name && o.name.trim())
      .slice(0, 3)
      .map((o) => ({
        ...o,
        name: o.name.trim(),
        styleTags: (o.styleTags || []).map((s) => String(s).trim()).filter(Boolean),
      }));

    setLoading(true);
    try {
      const prompt = buildProjectPrompt({
        client: clientProfile as ClientProfile,
        outfits: cleanedOutfits,
        globalStyle
      });

      let response;
      if (await hasApiConfig()) {
        response = await generateText(prompt);
      } else {
        response = await generateWithNano(prompt);
      }

      const data = parseLlmJson(response);

      const normalized = normalizeProjectPlan({
        ...data,
        id: Date.now().toString(),
        createdAt: Date.now(),
        client: data.client ?? clientProfile,
        outfits: data.outfits ?? cleanedOutfits,
        globalStyle,
      });

      setPlan(null);
      setProjectPlan(normalized);

      const title = buildProjectTitle(normalized.client); // 方案 A
      const record: PlanRecord = { kind: 'project', data: normalized, title };
      const newHistory: PlanRecord[] = [record, ...history].slice(0, 20);
      setHistory(newHistory);
      localStorage.setItem('shooting_history', serializeHistory(newHistory));

      // 项目模式：不自动生成图片（避免成本爆炸）
      setSceneImages({});

    } catch (error: any) {
      console.error(error);
      alert(`项目生成失败：${error?.message || '请检查设置或稍后重试。'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (loading) return;

    // 三套服装：走项目生成
    if (useOutfitMode) {
      await handleGenerateProject();
      return;
    }

    if (!topic) return;
    setLoading(true);
    try {
      // save recent topic for quick chips
      saveRecentTopic(topic);

      const prompt = `作为一个资深摄影师和创意导演，请为主题为"${topic}"的拍摄任务提供创意方案。
      请以 JSON 格式返回，结构如下：
      {
        "title": "预案名称",
        "theme": "核心主题",
        "creativeIdea": "具体的创意思路和风格建议",
        "copywriting": "核心旁白或宣传文案",
        "scenes": [
          {
            "location": "场景名称",
            "description": "场景内容描述",
            "shots": "拍摄手法建议",
            "visualPrompt": "A highly detailed English stable diffusion prompt for this scene, including lighting, mood, and camera angle. Focus on visual keywords."
          }
        ]
      }
      请直接返回 JSON 内容，不要包含 markdown 代码块标记。所有内容用中文回答，但 "visualPrompt" 必须使用英文。`;

      let response;
      if (await hasApiConfig()) {
        response = await generateText(prompt);
      } else {
        response = await generateWithNano(prompt);
      }

      const data = parseLlmJson(response);
      const newPlan: ExtendedShootingPlan = {
        ...data,
        id: Date.now().toString(),
        createdAt: Date.now(),
      };

      setProjectPlan(null);
      setPlan(newPlan);

      // 保存到历史记录
      const record: PlanRecord = { kind: 'single', data: newPlan };
      const newHistory: PlanRecord[] = [record, ...history].slice(0, 20); // 保留最近20条
      setHistory(newHistory);
      localStorage.setItem('shooting_history', serializeHistory(newHistory));

      // 不自动生成参考图：改为手动“一键生成全部参考图”

    } catch (error: any) {
      console.error(error);
      alert(`生成失败：${error?.message || '请检查设置。'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--paper)]">
      <Sidebar 
        onNewChat={handleNewChat} 
        history={history} 
        onSelectHistory={loadHistoryPlan}
        onDeleteHistory={(id) => {
          const newHistory = history.filter((p) => (p.kind === 'single' ? p.data.id : p.data.id) !== id);
          setHistory(newHistory);
          localStorage.setItem('shooting_history', serializeHistory(newHistory));

          if (plan?.id === id || projectPlan?.id === id) {
            setPlan(null);
            setProjectPlan(null);
            setTopic('');
            setSceneImages({});
            setPromptDrafts({});
          }
        }}
        currentId={plan?.id || projectPlan?.id}
      />

      <div className="flex-1 flex flex-col relative overflow-hidden" style={{ background: 'transparent' }}>
        <div className="flex-1 overflow-y-auto custom-scrollbar" ref={scrollRef}>
          <div className="max-w-4xl mx-auto px-6 py-12 md:py-20">
            
            {!plan && !loading && (
              <div className="space-y-12 animate-in fade-in duration-1000">
                <div className="space-y-5">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-4 py-2 text-xs tracking-widest text-[var(--ink-2)] shadow-sm">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--primary)' }} />
                    拍摄预案
                  </div>

                  <h2 className="text-[40px] md:text-[52px] leading-[1.06] tracking-tight text-[var(--ink)]" >
                    你好，我是你的
                    <br />
                    <span className="relative">拍摄预案助手</span>
                    。
                  </h2>

                  <p className="text-lg md:text-xl text-[var(--ink-2)] leading-relaxed max-w-2xl">
                    输入一个主题，我为你生成分镜结构、镜头建议与视觉参考图。
                    <span className="text-[var(--ink-3)]">（更像摄影导演的前期脚本，而不是模板。）</span>
                  </p>
                </div>

                <div className="space-y-10">
                  <div className="rounded-[var(--radius-2xl)] border border-[var(--line)] bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-[var(--ink)]">生成方式</div>
                        <div className="mt-1 text-xs text-[var(--ink-3)]">普通主题：一个主题生成一套分镜；3 套服装：一次性生成整套项目。</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setUseOutfitMode((v) => !v)}
                        className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50 transition"
                      >
                        {useOutfitMode ? '切换为普通主题' : '切换为 3 套服装'}
                      </button>
                    </div>

                    {!useOutfitMode && (
                      <div className="mt-4">
                        <TopicChips
                          onPick={(t) => {
                            setTopic(t);
                            requestAnimationFrame(() => inputRef.current?.focus());
                          }}
                        />
                      </div>
                    )}

                    {useOutfitMode && (
                      <div className="mt-4 space-y-4">
                        <OutfitPlannerForm
                          client={clientProfile}
                          onClientChange={(patch) => setClientProfile((prev) => ({ ...prev, ...patch }))}
                          outfits={outfits}
                          onOutfitsChange={setOutfits}
                        />
                        <GlobalStyleSelector
                          style={globalStyle}
                          onChange={setGlobalStyle}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                <p className="text-[var(--ink-2)] font-medium">正在生成预案...</p>
              </div>
            )}

            {projectPlan && !loading && (
              <div className="grid gap-8 lg:grid-cols-[1fr_260px] animate-in slide-in-from-bottom-8 duration-700">
                <div className="space-y-10">
                  <div id="proj-overview" className="space-y-5">
                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold text-[var(--ink-3)]">生成结果（项目）</div>
                        <h1 className="mt-2 text-3xl md:text-4xl font-semibold text-[var(--ink)]">
                          {buildProjectTitle(projectPlan.client)}
                        </h1>
                        <p className="mt-2 text-sm text-[var(--ink-2)] flex items-center gap-2">
                          <span className="inline-flex h-2 w-2 rounded-full" style={{ background: 'var(--primary)' }} />
                          <Info className="w-4 h-4" />
                          客户：{projectPlan.client.age ?? '未知'}岁｜{projectPlan.client.gender}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        {batchQueue.active ? (
                          <>
                            <div className="text-sm text-[var(--ink-2)]">
                              生成中 {batchQueue.completed}/{batchQueue.total}
                            </div>
                            <button
                              type="button"
                              onClick={cancelBatchGeneration}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-5 py-2.5 text-sm font-semibold text-red-600 shadow-sm hover:bg-red-50 transition"
                            >
                              <XCircle className="w-5 h-5" />
                              取消生成
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              const tasks = projectPlan.plans
                                .flatMap((p, lookIdx) =>
                                  (p.scenes || []).map((s, si) => ({
                                    visualPrompt: s.visualPrompt || '',
                                    sceneKey: lookIdx * 100 + si,
                                  }))
                                )
                                .filter((t) => !!t.visualPrompt);

                              if (!tasks.length) {
                                alert('没有找到可生成的 visualPrompt。');
                                return;
                              }

                              if (!confirm(`将开始生成全部 ${tasks.length} 张参考图，可能会消耗额度。确定继续吗？`)) return;

                              // 初始化批量生成
                              const abortController = new AbortController();
                              batchAbortRef.current = abortController;
                              batchTimeoutsRef.current = [];
                              setBatchQueue({ total: tasks.length, completed: 0, active: true });

                              tasks.forEach((t, idx) => {
                                const timeoutId = setTimeout(() => {
                                  if (!abortController.signal.aborted) {
                                    generateImage(t.visualPrompt, t.sceneKey, abortController.signal);
                                  }
                                }, idx * 900);
                                batchTimeoutsRef.current.push(timeoutId);
                              });
                            }}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95 transition"
                          >
                            <Wand2 className="w-5 h-5" />
                            一键生成全部参考图
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="rounded-[var(--radius-xl)] border border-[var(--line)] bg-white p-4 shadow-sm">
                        <div className="text-[10px] font-semibold text-[var(--ink-3)] tracking-widest">套装数量</div>
                        <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">{projectPlan.plans.length}</div>
                      </div>
                      <div className="rounded-[var(--radius-xl)] border border-[var(--line)] bg-white p-4 shadow-sm">
                        <div className="text-[10px] font-semibold text-[var(--ink-3)] tracking-widest">场景总数</div>
                        <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">{projectPlan.plans.reduce((acc, p) => acc + (p.scenes?.length || 0), 0)}</div>
                      </div>
                      <div className="rounded-[var(--radius-xl)] border border-[var(--line)] bg-white p-4 shadow-sm">
                        <div className="text-[10px] font-semibold text-[var(--ink-3)] tracking-widest">参考图</div>
                        <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">手动生成</div>
                      </div>
                      <div className="rounded-[var(--radius-xl)] border border-[var(--line)] bg-white p-4 shadow-sm">
                        <div className="text-[10px] font-semibold text-[var(--ink-3)] tracking-widest">导出</div>
                        <div className="mt-2 flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-[var(--ink-2)]">PPT 风格：</label>
                            <div className="relative flex-1">
                              <select
                                value={pptStyleId}
                                onChange={(e) => setPptStyleId(e.target.value)}
                                className="w-full appearance-none rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 pr-8 text-xs text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-primary"
                              >
                                {Object.values(PPT_STYLES).map((s) => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-3)]" />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => exportProjectToPPT(projectPlan, { images: sceneImages, styleId: pptStyleId })}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95 transition"
                          >
                            <FileDown className="w-4 h-4" />
                            导出项目 PPT
                          </button>

                          <button
                            type="button"
                            disabled={Object.keys(sceneImages).length === 0}
                            onClick={() =>
                              exportProjectToPPT(projectPlan, {
                                images: sceneImages as any,
                                fileName: `${buildProjectTitle(projectPlan.client)}_拍摄预案_含参考图.pptx`,
                                styleId: pptStyleId,
                              })
                            }
                            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${Object.keys(sceneImages).length === 0
                                ? 'border-[var(--line)] text-[var(--ink-3)] bg-white'
                                : 'border-[var(--line)] text-[var(--ink)] bg-white hover:bg-gray-50'}`}
                            title={Object.keys(sceneImages).length === 0 ? '请先生成至少一张参考图' : '将已生成的参考图嵌入 PPT（未生成的场景会留空）'}
                          >
                            <ImageIcon className="w-4 h-4" />
                            导出（含参考图）
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {projectPlan.plans.map((p, idx) => (
                    <div key={p.outfitId || idx} id={`look-${idx + 1}`} className="space-y-4">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-[var(--ink-3)]">第 {idx + 1} 套</div>
                          <h3 className="mt-1 text-lg font-semibold text-[var(--ink)]">{p.themeTitle || p.outfitName || `Look ${idx + 1}`}</h3>
                          <p className="mt-1 text-sm text-[var(--ink-2)]">{p.theme}</p>
                        </div>
                      </div>

                      <div className="grid gap-4">
                        {p.scenes.map((s, si) => {
                          const sceneKey = idx * 100 + si;
                          return (
                            <div
                              key={sceneKey}
                              id={`look-${idx + 1}-scene-${si + 1}`}
                              className="rounded-[var(--radius-2xl)] border border-[var(--line)] bg-white shadow-sm overflow-hidden"
                            >
                              <div className="p-6 space-y-3">
                                <div className="flex items-center justify-between gap-4">
                                  <div>
                                    <div className="text-xs font-semibold text-[var(--ink-3)]">{s.type}</div>
                                    <div className="text-base font-semibold text-[var(--ink)]">{s.location}</div>
                                  </div>
                                  {s.visualPrompt ? (
                                    <button
                                      type="button"
                                      onClick={() => generateImage((promptDrafts[sceneKey] ?? s.visualPrompt).trim(), sceneKey)}
                                      className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)] hover:bg-gray-50 transition"
                                    >
                                      <Wand2 className="w-4 h-4 text-[var(--ink-2)]" />
                                      {sceneImages[sceneKey] ? '重新生成参考图' : '生成参考图'}
                                    </button>
                                  ) : (
                                    <div className="text-xs text-[var(--ink-3)]">无 visualPrompt</div>
                                  )}
                                </div>

                                <p className="text-sm text-[var(--ink-2)] leading-relaxed">{s.description}</p>
                                <div className="rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-4 text-sm text-[var(--ink)]">
                                  <span className="text-[var(--ink-3)]">镜头建议：</span>{s.shots}
                                </div>

                                {s.type === '纯色版面' && s.cutoutSpec && (
                                  <div className="rounded-xl border border-[var(--line)] bg-white p-4 text-sm text-[var(--ink)]">
                                    <div className="text-[10px] font-semibold text-[var(--ink-3)] tracking-widest">纯色版面（抠图/排版）</div>
                                    <div className="grid gap-2 text-xs text-[var(--ink-2)]">
                                      <div><b>背景：</b>{s.cutoutSpec.background}</div>
                                      <div><b>打光：</b>{s.cutoutSpec.lighting}</div>
                                      <div><b>构图：</b>{s.cutoutSpec.framing}</div>
                                    </div>
                                  </div>
                                )}

                                {s.visualPrompt && (
                                  <div className="rounded-xl border border-[var(--line)] bg-white p-4">
                                    <div className="text-[10px] font-semibold text-[var(--ink-3)] tracking-widest mb-2">生图提示词（英文，自动保存）</div>
                                    <textarea
                                      value={promptDrafts[sceneKey] ?? s.visualPrompt}
                                      onChange={(e) => {
                                        const newValue = e.target.value;
                                        setPromptDrafts((prev) => ({ ...prev, [sceneKey]: newValue }));
                                        // 防抖自动保存
                                        debouncedSaveProjectPrompt(idx, si, newValue.trim());
                                      }}
                                      rows={4}
                                      className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-mono text-[var(--ink)] leading-relaxed"
                                    />
                                    <div className="mt-2 flex justify-end">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const nextPrompt = (promptDrafts[sceneKey] ?? s.visualPrompt).trim();
                                          if (!nextPrompt) return alert('提示词为空');

                                          // 立即保存（不等防抖）
                                          saveProjectPrompt(idx, si, nextPrompt);

                                          // 生成图片
                                          generateImage(nextPrompt, sceneKey);
                                        }}
                                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-gray-50"
                                      >
                                        <Wand2 className="w-4 h-4" />
                                        生成
                                      </button>
                                    </div>
                                  </div>
                                )}

                                <div className="rounded-xl border border-[var(--line)] bg-[var(--paper-2)] min-h-[220px] relative overflow-hidden">
                                  {sceneImages[sceneKey] ? (
                                    <img src={sceneImages[sceneKey]} alt="Reference" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--ink-3)] p-8 text-center">
                                      <ImageIcon className="w-10 h-10 mb-3 opacity-50" />
                                      <p className="text-xs">点击按钮生成参考图</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <PlanToc
                  containerSelector=".custom-scrollbar"
                  sections={[ 
                    { id: 'proj-overview', label: '项目概览', level: 0 },
                    ...projectPlan.plans.flatMap((p, idx) => {
                      const lookId = `look-${idx + 1}`;
                      return [
                        { id: lookId, label: `第 ${idx + 1} 套：${p.themeTitle || p.outfitName || `Look ${idx + 1}`}`, level: 0 as const },
                        { id: `look-${idx + 1}-scene-1`, label: '主场景', level: 1 as const },
                        { id: `look-${idx + 1}-scene-2`, label: '叠搭A', level: 1 as const },
                        { id: `look-${idx + 1}-scene-3`, label: '叠搭B', level: 1 as const },
                        { id: `look-${idx + 1}-scene-4`, label: '纯色版面', level: 1 as const },
                      ];
                    }),
                  ]}
                />
              </div>
            )}

            {plan && !loading && (
              <div className="grid gap-8 lg:grid-cols-[1fr_260px] animate-in slide-in-from-bottom-8 duration-700">
                <div className="space-y-10">

                  {/* 顶部概览（参考案例页：大标题 + 简述 + 关键信息） */}
                  <div id="sec-overview" className="space-y-5">
                  <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold text-[var(--ink-3)]">生成结果</div>
                      <h1 className="mt-2 text-3xl md:text-4xl font-semibold text-[var(--ink)]">
                        {plan.title}
                      </h1>
                      <p className="mt-2 text-sm text-[var(--ink-2)] flex items-center gap-2">
                        <span className="inline-flex h-2 w-2 rounded-full" style={{ background: 'var(--primary)' }} />
                        <Info className="w-4 h-4" />
                        {plan.theme}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {batchQueue.active ? (
                        <>
                          <div className="text-sm text-[var(--ink-2)]">
                            生成中 {batchQueue.completed}/{batchQueue.total}
                          </div>
                          <button
                            type="button"
                            onClick={cancelBatchGeneration}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-5 py-2.5 text-sm font-semibold text-red-600 shadow-sm hover:bg-red-50 transition"
                          >
                            <XCircle className="w-5 h-5" />
                            取消生成
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (!confirm(`将开始生成全部 ${plan.scenes.length} 张参考图，可能会消耗额度。确定继续吗？`)) return;

                            // 初始化批量生成
                            const abortController = new AbortController();
                            batchAbortRef.current = abortController;
                            batchTimeoutsRef.current = [];
                            setBatchQueue({ total: plan.scenes.length, completed: 0, active: true });

                            plan.scenes.forEach((s, idx) => {
                              const timeoutId = setTimeout(() => {
                                if (!abortController.signal.aborted) {
                                  generateImage(s.visualPrompt, idx, abortController.signal);
                                }
                              }, idx * 900);
                              batchTimeoutsRef.current.push(timeoutId);
                            });
                          }}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--ink)] shadow-sm hover:bg-gray-50 transition"
                        >
                          <Wand2 className="w-5 h-5" />
                          生成全部参考图
                        </button>
                      )}

                      <button
                        onClick={() => exportToPPT(plan, { images: sceneImages, styleId: pptStyleId })}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95 transition"
                      >
                        <FileDown className="w-5 h-5" />
                        导出 PPT
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="rounded-[var(--radius-xl)] border border-[var(--line)] bg-white p-4 shadow-sm">
                      <div className="text-[10px] font-semibold text-[var(--ink-3)] tracking-widest">场景数量</div>
                      <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">{plan.scenes.length}</div>
                    </div>
                    <div className="rounded-[var(--radius-xl)] border border-[var(--line)] bg-white p-4 shadow-sm">
                      <div className="text-[10px] font-semibold text-[var(--ink-3)] tracking-widest">输出语言</div>
                      <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">中文</div>
                    </div>
                    <div className="rounded-[var(--radius-xl)] border border-[var(--line)] bg-white p-4 shadow-sm">
                      <div className="text-[10px] font-semibold text-[var(--ink-3)] tracking-widest">参考图</div>
                      <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">可生成</div>
                    </div>
                    <div className="rounded-[var(--radius-xl)] border border-[var(--line)] bg-white p-4 shadow-sm">
                      <div className="text-[10px] font-semibold text-[var(--ink-3)] tracking-widest">PPT 风格</div>
                      <div className="mt-2 relative">
                        <select
                          value={pptStyleId}
                          onChange={(e) => setPptStyleId(e.target.value)}
                          className="w-full appearance-none rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 pr-8 text-xs text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          {Object.values(PPT_STYLES).map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-3)]" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 章节：创意思路 */}
                <section id="sec-creative" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-[var(--ink)]">创意思路</h3>
                  </div>
                  <div className="rounded-[var(--radius-2xl)] border border-[var(--line)] bg-white p-6 shadow-sm">
                    <p className="text-[var(--ink-2)] leading-relaxed">{plan.creativeIdea}</p>
                  </div>
                </section>

                {/* 章节：核心文案 */}
                <section id="sec-copy" className="space-y-3">
                  <h3 className="text-lg font-semibold text-[var(--ink)]">核心文案</h3>
                  <div className="rounded-[var(--radius-2xl)] border border-[var(--line)] bg-white p-6 shadow-sm">
                    <p className="text-[var(--ink)] italic font-medium leading-relaxed">“{plan.copywriting}”</p>
                  </div>
                </section>

                {/* 章节：分镜规划 */}
                <section id="sec-scenes" className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--ink)]">分镜规划</h3>
                    <p className="mt-1 text-sm text-[var(--ink-3)]">每个场景包含地点、描述、镜头建议与可用于生图的提示词。</p>
                  </div>

                  <div className="grid gap-6">
                    {plan.scenes.map((scene, i) => (
                      <div
                        key={i}
                        className="rounded-[var(--radius-2xl)] border border-[var(--line)] bg-white shadow-sm overflow-hidden"
                      >
                        <div className="flex flex-col md:flex-row">
                          <div className="md:w-1/2 p-6 space-y-4">
                            <div className="flex items-center gap-3">
                              <span className="bg-gray-900 text-white w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold">
                                {i + 1}
                              </span>
                              <h4 className="text-lg font-semibold text-[var(--ink)]">{scene.location}</h4>
                            </div>

                            <p className="text-[var(--ink-2)] leading-relaxed">{scene.description}</p>

                            <div className="rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-4 text-sm text-[var(--ink)]">
                              <span className="text-[var(--ink-3)]">镜头建议：</span>{scene.shots}
                            </div>

                            <div className="rounded-xl border border-[var(--line)] bg-white p-4">
                              <div className="text-[10px] font-semibold text-[var(--ink-3)] tracking-widest mb-2">
                                生图提示词（英文，自动保存）
                              </div>
                              <textarea
                                value={promptDrafts[i] ?? scene.visualPrompt}
                                onChange={(e) => {
                                  const newValue = e.target.value;
                                  setPromptDrafts((prev) => ({ ...prev, [i]: newValue }));
                                  // 防抖自动保存
                                  debouncedSaveSinglePrompt(i, newValue.trim());
                                }}
                                rows={4}
                                className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-mono text-[var(--ink)] leading-relaxed"
                              />
                              <div className="mt-2 flex items-center justify-end">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextPrompt = (promptDrafts[i] ?? scene.visualPrompt).trim();
                                    if (!nextPrompt) return alert('提示词为空');

                                    // 立即保存（不等防抖）
                                    saveSinglePrompt(i, nextPrompt);

                                    // 生成图片
                                    generateImage(nextPrompt, i);
                                  }}
                                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-gray-50"
                                >
                                  <Wand2 className="w-4 h-4" />
                                  生成
                                </button>
                              </div>
                            </div>

                            <button
                              onClick={() => generateImage((promptDrafts[i] ?? scene.visualPrompt).trim(), i)}
                              className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)] hover:bg-gray-50 transition"
                            >
                              <Wand2 className="w-4 h-4 text-[var(--ink-2)]" />
                              {sceneImages[i] ? '重新生成参考图' : '生成参考图'}
                            </button>
                          </div>

                          <div className="md:w-1/2 bg-[var(--paper-2)] min-h-[320px] relative overflow-hidden">
                            {sceneImages[i] ? (
                              <img
                                src={sceneImages[i]}
                                alt="Reference"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--ink-3)] p-8 text-center">
                                <ImageIcon className="w-10 h-10 mb-3 opacity-50" />
                                <p className="text-xs">点击左侧按钮生成参考图</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                </div>

                <PlanToc
                  containerSelector=".custom-scrollbar"
                  sections={[ 
                    { id: 'sec-overview', label: '概览' },
                    { id: 'sec-creative', label: '创意思路' },
                    { id: 'sec-copy', label: '核心文案' },
                    { id: 'sec-scenes', label: '分镜规划' },
                  ]}
                />
              </div>
            )}
          </div>
        </div>

        <footer className="p-6 md:p-10">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center rounded-2xl border border-[var(--line)] bg-white shadow-sm focus-within:shadow-md transition">
              <input
                ref={inputRef}
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                placeholder={useOutfitMode ? "三套服装模式：此处可空（标题会自动生成）" : "输入拍摄主题，例如：1岁小宝｜春夏秋冬｜人像"}
                disabled={useOutfitMode}
                className="flex-1 bg-transparent border-none focus:ring-0 py-4 px-5 text-[var(--ink)] placeholder-[var(--ink-3)] text-base disabled:opacity-60"
                style={{ color: 'var(--ink)' }}
              />
              <button
                onClick={handleGenerate}
                disabled={loading || (!useOutfitMode && !topic)}
                className="mr-2 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition"
                style={ 
                  (useOutfitMode || topic)
                    ? { background: 'var(--primary)', color: 'var(--primary-foreground)' }
                    : { background: 'transparent', color: 'var(--ink-3)' }
                }
              >
                {useOutfitMode ? '生成三套预案' : '生成'}
              </button>
            </div>
          </div>
        </footer>

        <SettingsPanel />
      </div>
    </div>
  );
}