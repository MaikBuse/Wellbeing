export type JointSeed = {
  key: string;
  labelDe: string;
  region:
    | 'jaw'
    | 'neck'
    | 'shoulder'
    | 'elbow'
    | 'wrist'
    | 'hand'
    | 'hip'
    | 'knee'
    | 'ankle'
    | 'foot'
    | 'spine'
    | 'si';
  isPaired?: boolean;
  /** Part of the DAS28 joint count used in rheumatology. */
  inDas28?: boolean;
};

const roman = ['I', 'II', 'III', 'IV', 'V'];

const mcp: JointSeed[] = roman.map((r, i) => ({
  key: `mcp_${i + 1}`,
  labelDe: `Fingergrundgelenk ${r}`,
  region: 'hand' as const,
  inDas28: true,
}));

const pip: JointSeed[] = roman.map((r, i) => ({
  key: `pip_${i + 1}`,
  labelDe: `Fingermittelgelenk ${r}`,
  region: 'hand' as const,
  inDas28: true,
}));

const dip: JointSeed[] = roman.slice(1).map((r, i) => ({
  key: `dip_${i + 2}`,
  labelDe: `Fingerendgelenk ${r}`,
  region: 'hand' as const,
}));

const mtp: JointSeed[] = roman.map((r, i) => ({
  key: `mtp_${i + 1}`,
  labelDe: `Zehengrundgelenk ${r}`,
  region: 'foot' as const,
}));

export const JOINTS: JointSeed[] = [
  { key: 'shoulder', labelDe: 'Schulter', region: 'shoulder', inDas28: true },
  { key: 'elbow', labelDe: 'Ellenbogen', region: 'elbow', inDas28: true },
  { key: 'wrist', labelDe: 'Handgelenk', region: 'wrist', inDas28: true },
  ...mcp,
  ...pip,
  ...dip,
  { key: 'knee', labelDe: 'Knie', region: 'knee', inDas28: true },
  { key: 'hip', labelDe: 'Hüfte', region: 'hip' },
  { key: 'ankle', labelDe: 'Sprunggelenk', region: 'ankle' },
  ...mtp,
  {
    key: 'cervical_spine',
    labelDe: 'Halswirbelsäule',
    region: 'spine',
    isPaired: false,
  },
  {
    key: 'lumbar_spine',
    labelDe: 'Lendenwirbelsäule',
    region: 'spine',
    isPaired: false,
  },
  { key: 'tmj', labelDe: 'Kiefergelenk', region: 'jaw' },
  { key: 'si', labelDe: 'Iliosakralgelenk', region: 'si' },
];
