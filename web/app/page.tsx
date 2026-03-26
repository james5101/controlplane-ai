import Link from "next/link";
import { PlusCircle, GitBranch, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const recentActivity = [
  {
    repo: "payments-ecs-infra",
    template: "AWS ECS",
    status: "done" as const,
    time: "2 hours ago",
  },
  {
    repo: "auth-service-infra",
    template: "AWS ECS",
    status: "done" as const,
    time: "Yesterday",
  },
];

export default function DashboardPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Bootstrap production-ready infrastructure in seconds.
          </p>
        </div>
        <Link href="/new">
          <Button>
            <PlusCircle className="h-4 w-4" />
            New Service
          </Button>
        </Link>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Link href="/new">
          <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
            <CardContent className="pt-6 pb-5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-50 p-2.5">
                  <GitBranch className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-sm text-gray-900">Bootstrap Repo</p>
                  <p className="text-xs text-gray-500">Terraform + CI/CD</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card className="opacity-50 cursor-not-allowed">
          <CardContent className="pt-6 pb-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-gray-100 p-2.5">
                <PlusCircle className="h-5 w-5 text-gray-400" />
              </div>
              <div>
                <p className="font-medium text-sm text-gray-400">Deploy Service</p>
                <p className="text-xs text-gray-400">Coming soon</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="opacity-50 cursor-not-allowed">
          <CardContent className="pt-6 pb-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-gray-100 p-2.5">
                <PlusCircle className="h-5 w-5 text-gray-400" />
              </div>
              <div>
                <p className="font-medium text-sm text-gray-400">Provision Infra</p>
                <p className="text-xs text-gray-400">Coming soon</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your latest bootstrapped repositories</CardDescription>
        </CardHeader>
        <div className="divide-y divide-gray-100">
          {recentActivity.map((item) => (
            <div
              key={item.repo}
              className="flex items-center justify-between px-6 py-3"
            >
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.repo}</p>
                  <p className="text-xs text-gray-500">{item.template}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="success">Completed</Badge>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {item.time}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
