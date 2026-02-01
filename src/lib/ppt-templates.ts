export interface PptStyle {
  id: string;
  name: string;
  colors: {
    ink: string;
    sub: string;
    light: string;
    line: string;
    paper: string;
    paper2: string;
    accent?: string;
  };
  fonts: {
    title: string;
    body: string;
  };
}

export const PPT_STYLES: Record<string, PptStyle> = {
  minimal: {
    id: 'minimal',
    name: '简约白 (Minimalist)',
    colors: {
      ink: '161616',
      sub: '5E5E5E',
      light: '9A9A9A',
      line: 'E6E6E6',
      paper: 'FFFFFF',
      paper2: 'F6F6F6',
    },
    fonts: {
      title: 'Microsoft YaHei',
      body: 'Microsoft YaHei',
    },
  },
  magazine: {
    id: 'magazine',
    name: '杂志风 (Magazine Style)',
    colors: {
      ink: '000000',
      sub: '333333',
      light: '666666',
      line: 'CCCCCC',
      paper: 'FAFAFA',
      paper2: 'F0F0F0',
      accent: 'B03060', // Maroon-like
    },
    fonts: {
      title: 'SimSun', // Serif for magazine feel
      body: 'Microsoft YaHei',
    },
  },
  ecommerce: {
    id: 'ecommerce',
    name: '电商风 (E-commerce)',
    colors: {
      ink: '222222',
      sub: '666666',
      light: '999999',
      line: 'EEEEEE',
      paper: 'FFFFFF',
      paper2: 'F9F9F9',
      accent: 'FF4400', // Orange-ish
    },
    fonts: {
      title: 'Microsoft YaHei',
      body: 'Microsoft YaHei',
    },
  },
};
