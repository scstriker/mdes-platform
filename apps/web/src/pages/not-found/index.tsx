import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Page } from "@/components/layout/page";

export default function NotFoundPage() {
  return (
    <Page title="页面不存在" lead="地址可能有误，或该页面已调整。">
      <Button asChild>
        <Link to="/">返回概览</Link>
      </Button>
    </Page>
  );
}
