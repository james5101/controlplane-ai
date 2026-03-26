import { GitBranch, Clock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function CatalogPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Catalog</h1>
        <p className="text-sm text-gray-500 mt-1">
          All services bootstrapped by ControlPlane AI.
        </p>
      </div>

      <Card>
        <CardContent className="py-12 text-center">
          <GitBranch className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No services yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Bootstrap your first service to see it here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
