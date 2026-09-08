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
      width={1024}
      height={1536}
      className={clsx("h-auto", className)}
      priority={priority}
    />
  );
}
