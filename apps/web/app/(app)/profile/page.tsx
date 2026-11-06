import { RequireAuth } from '@/components/auth'
import { ProfileForm } from '@/components/profile-form'

export default function ProfilePage() {
  return (
    <RequireAuth what="edit your profile">
      <ProfileForm />
    </RequireAuth>
  )
}
