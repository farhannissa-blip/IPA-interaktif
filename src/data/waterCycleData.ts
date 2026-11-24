export type WaterCycleStageId =
  | 'overview'
  | 'evaporasi'
  | 'transpirasi'
  | 'kondensasi'
  | 'presipitasi'
  | 'infiltrasi';

export interface StageMood {
  skyTopHex: number;
  bgHex: number;
  fogHex: number;
  fogDensity: number;
  sunColorHex: number;
  sunIntensity: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  rimIntensity: number;
  exposure: number;
  cloudDarkness: number; // 0 = sunlit ivory, 1 = storm slate
}

export interface WaterCycleStage {
  id: WaterCycleStageId;
  stepNumber: string;
  shortLabel: string;
  title: string;
  indonesianSubtitle: string;
  phaseTransform: string;
  temperatureLabel: string;
  altitudeLabel: string;
  accentHex: string;
  summary: string;
  detailFact: string;
  dailyExample: string;
  touchPrompt: string;
  narrationMainUrl: string;
  narrationExtraUrl: string;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  hotspotWorldPos: [number, number, number];
  mood: StageMood;
}

export const STAGE_ORDER: WaterCycleStageId[] = [
  'overview',
  'evaporasi',
  'transpirasi',
  'kondensasi',
  'presipitasi',
  'infiltrasi',
];

export const WATER_CYCLE_STAGES: Record<WaterCycleStageId, WaterCycleStage> = {
  overview: {
    id: 'overview',
    stepNumber: '00',
    shortLabel: 'Siklus Utuh',
    title: 'Siklus Air di Bumi',
    indonesianSubtitle: 'Perputaran Air Tanpa Henti',
    phaseTransform: 'Cair · Gas · Cair',
    temperatureLabel: '18°C – 32°C',
    altitudeLabel: '0 – 4.500 m',
    accentHex: '#d4af6a',
    summary:
      'Siklus air adalah perputaran air secara terus-menerus dari permukaan bumi ke atmosfer, lalu kembali lagi ke bumi sehingga ketersediaan air tetap terjaga.',
    detailFact:
      'Jumlah air di bumi sebenarnya tidak pernah habis, melainkan selalu berpindah tempat dan berubah wujud melalui 5 tahap utama.',
    dailyExample:
      'Air laut yang menguap hari ini bisa turun menjadi hujan yang menyegarkan kebun sekolahmu beberapa hari kemudian.',
    touchPrompt: 'Sentuh bagian laut, hutan, awan, gunung, atau lapisan tanah — atau ketuk layar untuk mulai tahap demi tahap.',
    narrationMainUrl: '/assets/aistudio/00_siklus_utuh_1b931c30.mp3',
    narrationExtraUrl: '/assets/aistudio/00_siklus_utuh_tambahan_4d880063.mp3',
    cameraPosition: [13.6, 9.2, 15.0],
    cameraTarget: [0.0, 2.1, 0.0],
    hotspotWorldPos: [0, 4.4, 0],
    mood: {
      skyTopHex: 0x2c82cf,
      bgHex: 0xbce3fc,
      fogHex: 0xbce3fc,
      fogDensity: 0.0085,
      sunColorHex: 0xfff0cc,
      sunIntensity: 2.45,
      hemiSkyHex: 0xd6efff,
      hemiGroundHex: 0x5c7285,
      hemiIntensity: 1.0,
      rimIntensity: 0.9,
      exposure: 1.0,
      cloudDarkness: 0.08,
    },
  },
  evaporasi: {
    id: 'evaporasi',
    stepNumber: '01',
    shortLabel: 'Evaporasi',
    title: 'Evaporasi',
    indonesianSubtitle: 'Penguapan Air Permukaan',
    phaseTransform: 'Cair → Uap Air (Gas)',
    temperatureLabel: '30°C – 36°C',
    altitudeLabel: '0 – 1.200 m',
    accentHex: '#e8b95c',
    summary:
      'Panas sinar matahari memanaskan air di laut, sungai, dan danau sehingga air berubah wujud menjadi uap air yang ringan dan naik ke langit.',
    detailFact:
      'Sekitar 86% uap air di atmosfer bumi berasal dari penguapan lautan luas yang terkena cahaya matahari langsung.',
    dailyExample:
      'Pakaian basah yang dijemur di bawah terik matahari menjadi kering karena airnya mengalami evaporasi ke udara.',
    touchPrompt: 'Ketuk layar untuk melihat bagaimana tumbuhan ikut melepaskan uap air (Transpirasi).',
    narrationMainUrl: '/assets/aistudio/01_evaporasi_466e4a1a.mp3',
    narrationExtraUrl: '/assets/aistudio/01_evaporasi_tambahan_9d01b388.mp3',
    cameraPosition: [9.8, 5.2, 9.2],
    cameraTarget: [3.2, 1.8, 0.3],
    hotspotWorldPos: [3.5, 1.4, 0.5],
    mood: {
      skyTopHex: 0x2584d8,
      bgHex: 0xcbeaff,
      fogHex: 0xcbeaff,
      fogDensity: 0.0078,
      sunColorHex: 0xffe09c,
      sunIntensity: 2.85,
      hemiSkyHex: 0xe6f4ff,
      hemiGroundHex: 0x6b6757,
      hemiIntensity: 1.05,
      rimIntensity: 1.0,
      exposure: 1.04,
      cloudDarkness: 0.0,
    },
  },
  transpirasi: {
    id: 'transpirasi',
    stepNumber: '02',
    shortLabel: 'Transpirasi',
    title: 'Transpirasi',
    indonesianSubtitle: 'Penguapan dari Tumbuhan',
    phaseTransform: 'Air Daun → Uap Air',
    temperatureLabel: '24°C – 30°C',
    altitudeLabel: '300 – 1.600 m',
    accentHex: '#52c79a',
    summary:
      'Selain dari laut, tumbuhan di hutan juga ikut melepaskan uap air ke udara melalui pori-pori kecil pada permukaan daun yang disebut stomata.',
    detailFact:
      'Satu pohon besar di hutan hujan dapat melepaskan ratusan liter uap air ke atmosfer setiap harinya.',
    dailyExample:
      'Udara di bawah pohon rindang terasa sejuk karena daun terus melepaskan uap air segar ke lingkungan sekitar.',
    touchPrompt: 'Ketuk layar untuk mengikuti uap air yang mendingin menjadi awan (Kondensasi).',
    narrationMainUrl: '/assets/aistudio/02_transpirasi_b99c94dd.mp3',
    narrationExtraUrl: '/assets/aistudio/02_transpirasi_tambahan_b5a44900.mp3',
    cameraPosition: [4.8, 5.8, 10.6],
    cameraTarget: [-1.1, 2.0, 0.9],
    hotspotWorldPos: [-1.2, 2.4, 1.5],
    mood: {
      skyTopHex: 0x2a8fd1,
      bgHex: 0xc2ecfa,
      fogHex: 0xc2ecfa,
      fogDensity: 0.0082,
      sunColorHex: 0xfff2d2,
      sunIntensity: 2.5,
      hemiSkyHex: 0xd4f7f2,
      hemiGroundHex: 0x4c6b54,
      hemiIntensity: 1.05,
      rimIntensity: 0.88,
      exposure: 1.01,
      cloudDarkness: 0.06,
    },
  },
  kondensasi: {
    id: 'kondensasi',
    stepNumber: '03',
    shortLabel: 'Kondensasi',
    title: 'Kondensasi',
    indonesianSubtitle: 'Pengembunan Membentuk Awan',
    phaseTransform: 'Uap Air → Titik Air',
    temperatureLabel: '2°C – 10°C',
    altitudeLabel: '2.000 – 4.500 m',
    accentHex: '#7cc6f7',
    summary:
      'Saat uap air naik semakin tinggi ke tempat yang bersuhu dingin, uap air mendingin dan berubah menjadi jutaan titik air halus yang berkumpul membentuk awan.',
    detailFact:
      'Semakin banyak uap air yang mengembun, gumpalan awan akan tumbuh semakin besar, padat, dan tertiup angin menuju daratan.',
    dailyExample:
      'Munculnya titik-titik embun dingin di dinding luar gelas berisi es batu adalah contoh nyata peristiwa kondensasi.',
    touchPrompt: 'Ketuk layar untuk melihat awan jenuh menurunkan hujan (Presipitasi).',
    narrationMainUrl: '/assets/aistudio/03_kondensasi_3599ae31.mp3',
    narrationExtraUrl: '/assets/aistudio/03_kondensasi_tambahan_0618b66d.mp3',
    cameraPosition: [8.6, 9.9, 12.6],
    cameraTarget: [0.1, 6.4, -0.6],
    hotspotWorldPos: [0.5, 7.3, -0.5],
    mood: {
      skyTopHex: 0x2472bf,
      bgHex: 0xaad6f7,
      fogHex: 0xaad6f7,
      fogDensity: 0.0085,
      sunColorHex: 0xf2f8ff,
      sunIntensity: 2.2,
      hemiSkyHex: 0xcce8ff,
      hemiGroundHex: 0x4d6278,
      hemiIntensity: 1.08,
      rimIntensity: 1.05,
      exposure: 1.0,
      cloudDarkness: 0.28,
    },
  },
  presipitasi: {
    id: 'presipitasi',
    stepNumber: '04',
    shortLabel: 'Presipitasi',
    title: 'Presipitasi',
    indonesianSubtitle: 'Turunnya Hujan ke Bumi',
    phaseTransform: 'Titik Awan → Air Hujan',
    temperatureLabel: '14°C – 21°C',
    altitudeLabel: '1.200 – 3.800 m',
    accentHex: '#5ca9e6',
    summary:
      'Ketika titik-titik air di dalam awan sudah terlalu banyak dan berat sehingga udara tidak sanggup menahannya, air jatuh ke permukaan bumi sebagai hujan.',
    detailFact:
      'Di daerah pegunungan yang sangat dingin dengan suhu di bawah 0°C, presipitasi dapat turun dalam bentuk salju atau hujan es.',
    dailyExample:
      'Langit menjadi mendung kelabu sebelum titik-titik hujan turun membasahi pegunungan, sawah, dan atap rumah.',
    touchPrompt: 'Ketuk layar untuk melihat ke mana perginya air hujan di dalam tanah (Infiltrasi).',
    narrationMainUrl: '/assets/aistudio/04_presipitasi_f2313c66.mp3',
    narrationExtraUrl: '/assets/aistudio/04_presipitasi_tambahan_38b5ddf8.mp3',
    cameraPosition: [-9.8, 7.6, 12.8],
    cameraTarget: [-2.75, 4.55, -0.55],
    hotspotWorldPos: [-3.05, 7.75, -0.75],
    mood: {
      skyTopHex: 0x436f9c,
      bgHex: 0x99bddb,
      fogHex: 0x99bddb,
      fogDensity: 0.011,
      sunColorHex: 0xd4e6fa,
      sunIntensity: 1.45,
      hemiSkyHex: 0xaac4de,
      hemiGroundHex: 0x3b4d61,
      hemiIntensity: 0.92,
      rimIntensity: 1.25,
      exposure: 0.96,
      cloudDarkness: 0.88,
    },
  },
  infiltrasi: {
    id: 'infiltrasi',
    stepNumber: '05',
    shortLabel: 'Infiltrasi',
    title: 'Infiltrasi & Limpasan',
    indonesianSubtitle: 'Penyerapan Tanah & Aliran Sungai',
    phaseTransform: 'Air Hujan → Air Tanah & Laut',
    temperatureLabel: '18°C – 24°C',
    altitudeLabel: '-60 m – 800 m',
    accentHex: '#38c7d4',
    summary:
      'Sebagian air hujan mengalir di permukaan melalui sungai menuju laut (limpasan), dan sebagian meresap ke pori-pori tanah menjadi cadangan air tanah (infiltrasi).',
    detailFact:
      'Akar pepohonan membantu mempercepat penyerapan air ke dalam tanah sehingga mencegah banjir dan menjaga mata air tetap mengalir saat kemarau.',
    dailyExample:
      'Air sumur yang jernih di rumah warga berasal dari air hujan yang tersaring alami melalui lapisan pasir dan batuan tanah.',
    touchPrompt: 'Ketuk layar untuk kembali melihat keseluruhan Siklus Air secara utuh.',
    narrationMainUrl: '/assets/aistudio/05_infiltasi_7f9039d3.mp3',
    narrationExtraUrl: '/assets/aistudio/05_infiltrasi_tambahan_8a49f556.mp3',
    cameraPosition: [0.8, 2.7, 11.8],
    cameraTarget: [-0.2, -0.15, 2.6],
    hotspotWorldPos: [-0.4, -0.45, 4.1],
    mood: {
      skyTopHex: 0x2a82c9,
      bgHex: 0xb6dff8,
      fogHex: 0xb6dff8,
      fogDensity: 0.0085,
      sunColorHex: 0xedf7ff,
      sunIntensity: 2.25,
      hemiSkyHex: 0xcbeeff,
      hemiGroundHex: 0x456373,
      hemiIntensity: 1.0,
      rimIntensity: 1.0,
      exposure: 1.0,
      cloudDarkness: 0.18,
    },
  },
};

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  relatedStage: WaterCycleStageId;
}

export const GRADE5_QUIZ: QuizQuestion[] = [
  {
    id: 1,
    question: 'Proses penguapan air dari laut, sungai, dan danau akibat panas sinar matahari disebut...',
    options: ['Kondensasi', 'Evaporasi', 'Presipitasi', 'Infiltrasi'],
    correctIndex: 1,
    explanation: 'Evaporasi adalah proses berubahnya air di permukaan bumi menjadi uap air karena pemanasan matahari.',
    relatedStage: 'evaporasi',
  },
  {
    id: 2,
    question: 'Tumbuhan juga ikut melepaskan uap air ke udara melalui pori-pori daun (stomata). Proses ini disebut...',
    options: ['Transpirasi', 'Infiltrasi', 'Kondensasi', 'Limpasan'],
    correctIndex: 0,
    explanation: 'Transpirasi adalah penguapan air yang berasal dari jaringan makhluk hidup, terutama daun tumbuhan.',
    relatedStage: 'transpirasi',
  },
  {
    id: 3,
    question: 'Ketika uap air naik ke atmosfer yang dingin dan berubah menjadi titik-titik air pembentuk awan, terjadilah...',
    options: ['Evaporasi', 'Presipitasi', 'Kondensasi', 'Infiltrasi'],
    correctIndex: 2,
    explanation: 'Kondensasi (pengembunan) mengubah uap air menjadi titik-titik air halus yang berkumpul membentuk awan.',
    relatedStage: 'kondensasi',
  },
  {
    id: 4,
    question: 'Jatuhnya air dari awan yang sudah jenuh dan berat kembali ke permukaan bumi sebagai hujan disebut...',
    options: ['Transpirasi', 'Presipitasi', 'Evaporasi', 'Kondensasi'],
    correctIndex: 1,
    explanation: 'Presipitasi adalah turunnya air dari atmosfer ke bumi dalam bentuk hujan, salju, atau hujan es.',
    relatedStage: 'presipitasi',
  },
  {
    id: 5,
    question: 'Mengapa pepohonan di hutan sangat penting pada tahap infiltrasi?',
    options: [
      'Menghalangi sinar matahari agar laut tidak menguap',
      'Membantu air hujan meresap ke pori-pori tanah menjadi cadangan air tanah',
      'Mengubah air laut menjadi uap panas secara langsung',
      'Mencegah awan bergerak menuju daratan',
    ],
    correctIndex: 1,
    explanation: 'Akar tumbuhan memperbesar daya serap tanah sehingga air hujan masuk ke lapisan air tanah (infiltrasi) dan mencegah banjir.',
    relatedStage: 'infiltrasi',
  },
];
