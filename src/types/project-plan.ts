export type Gender = '男' | '女' | '不限';

export type GlobalStyle = {
  colorTone: 'warm' | 'cool' | 'neutral';
  lightingMood: 'soft' | 'dramatic' | 'natural';
  era: 'modern' | 'vintage' | 'timeless';
};

export type LayeringTemplateKey =
  | '外套叠穿'
  | '帽子/发饰'
  | '围巾/披肩'
  | '鞋包替换'
  | '层次细节（卷袖/塞衣角/腰带）'
  | '道具加持（气球/花束/玩具/书本）'
  | '发型变化（扎发/散发/半扎）'
  | '动作变化（站/坐/走/跑/跳）'
  | '机位变化（近景/半身/全身/俯拍/仰拍）';

export type OutfitInput = {
  id: string;
  name: string;
  color?: string;
  styleTags: string[];
  material?: string;
  notes?: string;
  layeringA?: LayeringTemplateKey;
  layeringB?: LayeringTemplateKey;
};

export type ClientProfile = {
  age: number | null;
  gender: Gender;
  usage?: '电商' | '种草' | '品牌' | '留念' | '其它';
};

export type SceneType = '主场景' | '叠搭A' | '叠搭B' | '纯色版面';

export type CutoutSpec = {
  background: string;
  lighting: string;
  framing: string;
};

export type SceneProParams = {
  focalLengthMm?: 24 | 35 | 50 | 85 | 135;
  lightRatio?: '2:1' | '4:1' | '8:1';
  timeOfDay?: '黄金时段' | '蓝调时刻' | '正午硬光' | '阴天柔光';
  exposureStyle?: '高调' | '低调' | '正常';
  notes?: string;
};

export type ScenePlan = {
  type: SceneType;
  location: string;
  description: string;
  shots: string;
  proParams?: SceneProParams;
  visualPrompt?: string;
  cutoutSpec?: CutoutSpec;
};

export type OutfitPlan = {
  outfitId: string;
  outfitName: string;
  themeTitle: string;
  theme: string;
  creativeIdea: string;
  copywriting: string;
  scenes: ScenePlan[];
};

export type ProjectPlan = {
  id: string;
  createdAt: number;
  client: ClientProfile;
  outfits: OutfitInput[];
  plans: OutfitPlan[];
  globalStyle?: GlobalStyle;
};

export interface ShootingPlan {
  title: string;
  theme: string;
  creativeIdea: string;
  copywriting: string;
  scenes: {
    location: string;
    description: string;
    shots: string;
    visualPrompt: string;
  }[];
}

export interface ExtendedShootingPlan extends ShootingPlan {
  id: string;
  createdAt: number;
}

export type SinglePlanRecord = {
  kind: 'single';
  data: ExtendedShootingPlan;
};

export type ProjectPlanRecord = {
  kind: 'project';
  data: ProjectPlan;
  title: string;
};

export type PlanRecord = SinglePlanRecord | ProjectPlanRecord;

export function getPlanRecordId(r: PlanRecord): string {
  return r.data.id;
}

export function getPlanRecordTitle(r: PlanRecord): string {
  return r.kind === 'single' ? r.data.title : r.title;
}

export function getPlanRecordCreatedAt(r: PlanRecord): number {
  return r.data.createdAt;
}
