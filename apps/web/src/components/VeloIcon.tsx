export function VeloIcon({ size = 48 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width={size} height={size} fill="none">
      <circle cx="50" cy="50" r="45" stroke="#1E2030" strokeWidth="2" />
      <path
        d="M25,50 C35,30 65,30 75,50 C65,70 35,70 25,50 Z"
        stroke="#6366F1"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="50" r="12" fill="#12131C" stroke="#F3F4F6" strokeWidth="3" />
      <circle cx="47" cy="47" r="3" fill="#6366F1" />
      <circle cx="75" cy="50" r="4" fill="#10B981" />
    </svg>
  );
}
