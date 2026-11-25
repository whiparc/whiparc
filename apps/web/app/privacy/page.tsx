import type { Metadata } from 'next';
import PrivacyPage from './PrivacyPage';

export const metadata: Metadata = {
  title: 'Privacy Policy | Whiparc',
  description:
    'What data the Whiparc website, hosted service and CLI collect, why, who processes it, and how to export or delete it.',
};

export default function PrivacyRoute() {
  return <PrivacyPage />;
}
