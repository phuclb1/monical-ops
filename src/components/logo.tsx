import Image from "next/image";
import clsx from "clsx";

export function Logo({
  className,
  priority,
  alt = "MONICAL hotel dalat",
}: {
  className?: string;
  priority?: boolean;
  alt?: string;
}) {
  return (
    <Image
      src="/logo.png"
      alt={alt}
      width={280}
      height={420}
      sizes="(min-width: 768px) 280px, 220px"
      className={clsx("h-auto", className)}
      priority={priority}
    />
  );
}
