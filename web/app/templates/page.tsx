import { BookOpen } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const TEMPLATES = [
  {
    id: "aws-ecs-terraform",
    name: "AWS ECS + Terraform",
    description: "ECS service with Terraform, GitHub Actions CI/CD, dev and prod environments.",
    cloud: "AWS",
    ci: "GitHub Actions",
    status: "available" as const,
  },
  {
    id: "aws-lambda-terraform",
    name: "AWS Lambda + Terraform",
    description: "Lambda function with API Gateway, Terraform, GitHub Actions.",
    cloud: "AWS",
    ci: "GitHub Actions",
    status: "coming_soon" as const,
  },
  {
    id: "aws-eks-terraform",
    name: "AWS EKS + Terraform",
    description: "EKS cluster with Terraform, multi-environment support.",
    cloud: "AWS",
    ci: "GitHub Actions",
    status: "coming_soon" as const,
  },
];

export default function TemplatesPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
        <p className="text-sm text-gray-500 mt-1">
          Golden path templates used by the bootstrap agent.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TEMPLATES.map((t) => (
          <Card
            key={t.id}
            className={t.status === "coming_soon" ? "opacity-60" : ""}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-blue-500" />
                  <CardTitle>{t.name}</CardTitle>
                </div>
                {t.status === "coming_soon" ? (
                  <Badge variant="neutral">Coming soon</Badge>
                ) : (
                  <Badge variant="success">Available</Badge>
                )}
              </div>
              <CardDescription>{t.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Badge variant="default">{t.cloud}</Badge>
                <Badge variant="neutral">{t.ci}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
