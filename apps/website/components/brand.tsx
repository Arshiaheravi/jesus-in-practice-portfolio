import Link from "next/link";

export default function Brand() {
  return (
    <Link href="/" className="brand">
      <span className="brand-mark" aria-hidden="true">
        jp
      </span>
      <span>Jesus in Practice</span>
    </Link>
  );
}
