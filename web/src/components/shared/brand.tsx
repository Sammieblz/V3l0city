import Image from "next/image";
import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="V3l0city home">
      <Image className="brand-mark" src="/brand/brand-mark.png" alt="" width={36} height={36} priority />
      {!compact && <span>V3L0CITY</span>}
    </Link>
  );
}
