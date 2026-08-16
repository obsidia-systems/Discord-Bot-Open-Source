import { cn } from "@/lib/utils";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  initialsFromName,
} from "@/components/ui/avatar";

type UserAvatarProps = {
  src?: string | null;
  name: string;
  className?: string;
  /** Clase del círculo de iniciales (opcional). */
  fallbackClassName?: string;
};

/**
 * Avatar de usuario con PNG del API + iniciales si la imagen falla o falta.
 */
export function UserAvatar({
  src,
  name,
  className,
  fallbackClassName,
}: UserAvatarProps) {
  return (
    <Avatar className={cn("size-7 ring-1 ring-border", className)}>
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback className={fallbackClassName}>
        {initialsFromName(name)}
      </AvatarFallback>
    </Avatar>
  );
}
