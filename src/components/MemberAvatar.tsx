import { Avatar } from "./Avatar.tsx";
import { useProfilePhoto } from "../hooks/useProfilePhoto.ts";

export function MemberAvatar({
  name,
  userId,
  path,
}: {
  name: string;
  userId?: string;
  path?: string | null;
}) {
  const photo = useProfilePhoto(userId, path);
  return <Avatar name={name} url={photo.url} />;
}
