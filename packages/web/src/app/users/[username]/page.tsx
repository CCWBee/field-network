import { Metadata } from 'next';
import PublicProfileView from './PublicProfileView';

type Props = {
  params: Promise<{ username: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;

  // Try to fetch user data for meta tags
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  try {
    const response = await fetch(`${apiUrl}/v1/users/${encodeURIComponent(username)}`, {
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (response.ok) {
      const user = await response.json();
      const displayName = user.username || user.ens_name || username;
      const description = user.bio || `View ${displayName}'s profile on Field Network. Reliability: ${user.stats?.reliability_score?.toFixed(0) || 0}%, Tasks completed: ${user.stats?.tasks_completed || 0}.`;

      return {
        title: `${displayName} | Field Network`,
        description: description.slice(0, 160),
        openGraph: {
          title: `${displayName} | Field Network`,
          description: description.slice(0, 160),
          images: user.avatar_url ? [{ url: user.avatar_url }] : [],
          type: 'profile',
        },
        twitter: {
          card: 'summary',
          title: `${displayName} | Field Network`,
          description: description.slice(0, 160),
          images: user.avatar_url ? [user.avatar_url] : [],
        },
      };
    }
  } catch (error) {
    console.error('Error fetching user for metadata:', error);
  }

  // Fallback metadata
  return {
    title: `${username} | Field Network`,
    description: `View ${username}'s profile on Field Network - decentralized real-world data collection.`,
  };
}

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  return <PublicProfileView username={username} />;
}
