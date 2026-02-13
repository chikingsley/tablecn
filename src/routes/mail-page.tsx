import { Cloud, Globe, Mail as MailIcon } from "lucide-react";
import * as React from "react";

import { Mail } from "@/app/mail/components/mail";
import { deleteMail, updateMail } from "@/app/mail/lib/actions";
import type { Account } from "@/app/mail/lib/data";
import { subscribeToMailsChanged } from "@/app/mail/lib/mail-events";
import { getMailFolderCounts, getMails } from "@/app/mail/lib/queries";
import { Skeleton } from "@/components/ui/skeleton";
import type { Mail as MailType } from "@/db/schema";

const accounts: Account[] = [
  { label: "Alicia Koch", email: "alicia@example.com", icon: MailIcon },
  { label: "Alicia Koch", email: "alicia@gmail.com", icon: Globe },
  { label: "Alicia Koch", email: "alicia@icloud.com", icon: Cloud },
];

interface MailData {
  mails: MailType[];
  folderCounts: Record<string, number>;
}

function useMailData(folder: string) {
  const [data, setData] = React.useState<MailData | null>(null);

  const fetchData = React.useCallback(async () => {
    const [mails, folderCounts] = await Promise.all([
      getMails({ folder: folder as MailType["folder"] }),
      getMailFolderCounts(),
    ]);
    setData({ mails, folderCounts });
  }, [folder]);

  React.useEffect(() => {
    let stale = false;
    const run = async () => {
      await fetchData();
    };
    if (!stale) {
      run();
    }
    return () => {
      stale = true;
    };
  }, [fetchData]);

  React.useEffect(() => {
    return subscribeToMailsChanged(fetchData);
  }, [fetchData]);

  return data;
}

export function MailPage() {
  const [folder, setFolder] = React.useState("inbox");
  const data = useMailData(folder);

  const handleAction = React.useCallback(
    async (action: string, mailId: string) => {
      switch (action) {
        case "archive":
          await updateMail({ id: mailId, folder: "archive" });
          break;
        case "junk":
          await updateMail({ id: mailId, folder: "junk" });
          break;
        case "trash":
          await updateMail({ id: mailId, folder: "trash" });
          break;
        case "delete":
          await deleteMail({ id: mailId });
          break;
      }
    },
    []
  );

  if (!data) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <Mail
        accounts={accounts}
        currentFolder={folder}
        folderCounts={data.folderCounts}
        mails={data.mails}
        onAction={handleAction}
        onFolderChange={setFolder}
      />
    </div>
  );
}
