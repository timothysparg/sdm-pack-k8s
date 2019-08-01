/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as yaml from "js-yaml";
import * as stableStringify from "json-stable-stringify";
import { K8sObject } from "./api";
import { encryptSecret } from "./secret";

/**
 * Create a suitable basename for the spec file for `resource`.  The
 * form of the file name is "NN-NAMESPACE-NAME-KIND", where "NN" is a
 * numeric prefix so the resources are created in the proper order,
 * "NAMESPACE-" is omitted if resource is not namespaced, the kind is
 * converted from PascalCase to kebab-case, and the whole name is
 * lowercased.
 *
 * @param resource Kubernetes resource spec
 * @return Base file name for resource spec
 */
export function kubernetesSpecFileBasename(resource: K8sObject): string {
    let prefix: string;
    switch (resource.kind) {
        case "Namespace":
            prefix = "10";
            break;
        case "PersistentVolume":
        case "StorageClass":
            prefix = "15";
            break;
        case "ServiceAccount":
            prefix = "20";
            break;
        case "ClusterRole":
        case "Role":
            prefix = "25";
            break;
        case "ClusterRoleBinding":
        case "RoleBinding":
            prefix = "30";
            break;
        case "NetworkPolicy":
        case "PersistentVolumeClaim":
        case "PodSecurityPolicy":
            prefix = "40";
            break;
        case "Service":
            prefix = "50";
            break;
        case "ConfigMap":
        case "Secret":
            prefix = "60";
            break;
        case "CronJob":
        case "DaemonSet":
        case "Deployment":
        case "StatefulSet":
            prefix = "70";
            break;
        case "HorizontalPodAutoscaler":
        case "Ingress":
        case "PodDisruptionBudget":
            prefix = "80";
            break;
        default:
            prefix = "90";
            break;
    }
    const ns = (resource.metadata.namespace) ? `${resource.metadata.namespace}_` : "";
    const kebabKind = resource.kind.replace(/([a-z])([A-Z])/g, "$1-$2");
    return `${prefix}_${ns}${resource.metadata.name}_${kebabKind}`.toLowerCase();
}

/**
 * Options for creating a string representation of a Kubernetes
 * resource specification.
 */
export interface KubernetesSpecStringifyOptions {
    /**
     * Serialization format, either "json" or "yaml".  The default is
     * "json".
     */
    format?: "json" | "yaml";
    /**
     * The key to use to encrypt v1/Secret data values.  See
     * [[encryptSecret]] for details.  If no value is provided, the
     * secret data values are not encrypted.
     */
    secretKey?: string;
}

/**
 * Convert a Kubernetes resource spec into a stable string suitable
 * for writing to a file or comparisons.
 *
 * @param resource Kubernetes resource to stringify
 * @param options Options for serializing the resource spec
 * @return Stable string representation of the resource spec
 */
export async function kubernetesSpecStringify(spec: K8sObject, options: KubernetesSpecStringifyOptions = {}): Promise<string> {
    let resource = spec;
    if (resource.kind === "Secret" && options.secretKey) {
        resource = await encryptSecret(resource, options.secretKey);
    }
    if (options.format === "yaml") {
        return yaml.safeDump(resource, { sortKeys: true });
    } else {
        return stableStringify(resource, { space: 2 }) + "\n";
    }
}