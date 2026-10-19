export default function AppIcon({ size = 26 }: { size?: number }) {
  return <img className="commandnote-icon" src={`${import.meta.env.BASE_URL}brand/commandnote.svg`} width={size} height={size} alt="" aria-hidden="true" draggable={false} />;
}
