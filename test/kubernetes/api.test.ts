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

import { execPromise } from "@atomist/sdm";
import * as assert from "power-assert";
import {
    isClusterResource,
    K8sObject,
    specUriPath,
    uriOpts,
} from "../../lib/kubernetes/api";
import { applySpec } from "../../lib/kubernetes/apply";
import { deleteSpec } from "../../lib/kubernetes/delete";

describe("kubernetes/api", () => {

    const apiActions = ["create", "delete", "list", "patch", "read", "replace"];
    const clusterResources = [
        "APIService",
        "AuditSink",
        "CertificateSigningRequest",
        "ClusterCustomObject",
        "ClusterRole",
        "ClusterRoleBinding",
        "CustomResourceDefinition",
        "InitializerConfiguration",
        "MutatingWebhookConfiguration",
        "Namespace",
        "Node",
        "PersistentVolume",
        "PodSecurityPolicy",
        "PriorityClass",
        "SelfSubjectAccessReview",
        "SelfSubjectRulesReview",
        "StorageClass",
        "SubjectAccessReview",
        "TokenReview",
        "ValidatingWebhookConfiguration",
        "VolumeAttachment",
    ];
    const clusterStatuses = [
        "APIServiceStatus",
        "CertificateSigningRequestStatus",
        "CustomResourceDefinitionStatus",
        "NamespaceStatus",
        "NodeStatus",
        "PersistentVolumeStatus",
        "VolumeAttachmentStatus",
    ];

    describe("isClusterResource", () => {

        it("should return true for a cluster resource", () => {
            apiActions.forEach((a: any) => {
                clusterResources.forEach(r => {
                    assert(isClusterResource(a, r));
                });
            });
        });

        it("should return true for a cluster status resource with appropriate action", () => {
            ["patch", "read", "replace"].forEach((a: any) => {
                clusterStatuses.forEach(r => {
                    assert(isClusterResource(a, r));
                });
            });
        });

        it("should return false for a cluster status resource with other action", () => {
            ["create", "delete", "list"].forEach((a: any) => {
                clusterStatuses.forEach(r => {
                    assert(!isClusterResource(a, r));
                });
            });
        });

        it("should handle ComponentStatus properly", () => {
            ["list", "read"].forEach((a: any) => {
                assert(isClusterResource(a, "ComponentStatus"));
            });
            ["create", "delete", "patch", "replace"].forEach((a: any) => {
                assert(!isClusterResource(a, "ComponentStatus"));
            });
        });

        it("should return false for namespaced resource", () => {
            apiActions.forEach((a: any) => {
                ["ConfigMap", "CronJob", "DaemonSet", "Deployment", "Pod", "Role", "Service", "ServiceAccount", "StatefulSet"].forEach(r => {
                    assert(!isClusterResource(a, r));
                });
            });
        });

    });

    describe("uriOpts", () => {

        it("should return append name", () => {
            ["delete", "patch", "read", "replace"].forEach((a: any) => {
                const o = uriOpts(a, "Deployment");
                assert(o.appendName);
            });
        });

        it("should return not append name", () => {
            ["create", "list"].forEach((a: any) => {
                const o = uriOpts(a, "Deployment");
                assert(!o.appendName);
            });
        });

        it("should return namespace required", () => {
            ["create", "delete", "patch", "read", "replace"].forEach((a: any) => {
                ["ConfigMap", "CronJob", "DaemonSet", "Deployment", "Pod", "Role", "Service", "ServiceAccount", "StatefulSet"].forEach(r => {
                    const o = uriOpts(a, r);
                    assert(o.namespaceRequired);
                });
            });
        });

        it("should return namespace not required", () => {
            ["ConfigMap", "CronJob", "DaemonSet", "Deployment", "Pod", "Role", "Service", "ServiceAccount", "StatefulSet"].forEach(r => {
                const o = uriOpts("list", r);
                assert(!o.namespaceRequired);
            });
        });

        it("should return namespace not required", () => {
            apiActions.forEach((a: any) => {
                clusterResources.forEach(r => {
                    const o = uriOpts(a, r);
                    assert(!o.namespaceRequired);
                });
            });
        });

    });

    describe("specUriPath", () => {

        it("should return a namespaced path", () => {
            const o = {
                apiVersion: "v1",
                kind: "Service",
                metadata: {
                    name: "repeater",
                    namespace: "fugazi",
                },
            };
            const r = specUriPath(o, "patch");
            assert(r === "v1/namespaces/fugazi/services/repeater");
        });

        it("should return a non-namespaced path", () => {
            const o = {
                apiVersion: "v1",
                kind: "Namespace",
                metadata: {
                    name: "repeater",
                },
            };
            const r = specUriPath(o, "delete");
            assert(r === "v1/namespaces/repeater");
        });

        it("should return a namespaced path without name", () => {
            const o = {
                apiVersion: "v1",
                kind: "Service",
                metadata: {
                    namespace: "fugazi",
                },
            };
            const r = specUriPath(o, "list");
            assert(r === "v1/namespaces/fugazi/services");
        });

        it("should return a non-namespaced path without name", () => {
            const o = {
                apiVersion: "v1",
                kind: "Namespace",
                metadata: {
                    name: "repeater",
                },
            };
            const r = specUriPath(o, "create");
            assert(r === "v1/namespaces");
        });

        it("should return a namespaced path for non-core resource", () => {
            const o = {
                apiVersion: "apps/v1",
                kind: "Deployment",
                metadata: {
                    name: "repeater",
                    namespace: "fugazi",
                },
            };
            const r = specUriPath(o, "read");
            assert(r === "apps/v1/namespaces/fugazi/deployments/repeater");
        });

        it("should return properly pluralize", () => {
            const o = {
                apiVersion: "extensions/v1beta1",
                kind: "Ingress",
                metadata: {
                    name: "repeater",
                    namespace: "fugazi",
                },
            };
            const r = specUriPath(o, "delete");
            assert(r === "extensions/v1beta1/namespaces/fugazi/ingresses/repeater");
        });

        it("should handle a variety of resources", () => {
            /* tslint:disable:max-line-length */
            const a = [
                { apiVersion: "v1", kind: "Service", ns: true, e: "v1/namespaces/fugazi/services/repeater" },
                { apiVersion: "v1", kind: "ServiceAccount", ns: true, e: "v1/namespaces/fugazi/serviceaccounts/repeater" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role", ns: true, e: "rbac.authorization.k8s.io/v1/namespaces/fugazi/roles/repeater" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRole", ns: false, e: "rbac.authorization.k8s.io/v1/clusterroles/repeater" },
                { apiVersion: "extensions/v1beta1", kind: "NetworkPolicy", ns: true, e: "extensions/v1beta1/namespaces/fugazi/networkpolicies/repeater" },
                { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy", ns: true, e: "networking.k8s.io/v1/namespaces/fugazi/networkpolicies/repeater" },
                { apiVersion: "extensions/v1beta1", kind: "Ingress", ns: true, e: "extensions/v1beta1/namespaces/fugazi/ingresses/repeater" },
                { apiVersion: "extensions/v1beta1", kind: "DaemonSet", ns: true, e: "extensions/v1beta1/namespaces/fugazi/daemonsets/repeater" },
                { apiVersion: "extensions/v1beta1", kind: "DaemonSet", ns: true, e: "extensions/v1beta1/namespaces/fugazi/daemonsets/repeater" },
                { apiVersion: "apps/v1", kind: "DaemonSet", ns: true, e: "apps/v1/namespaces/fugazi/daemonsets/repeater" },
                { apiVersion: "extensions/v1beta1", kind: "Deployment", ns: true, e: "extensions/v1beta1/namespaces/fugazi/deployments/repeater" },
                { apiVersion: "apps/v1", kind: "Deployment", ns: true, e: "apps/v1/namespaces/fugazi/deployments/repeater" },
                { apiVersion: "storage.k8s.io/v1", kind: "StorageClass", ns: false, e: "storage.k8s.io/v1/storageclasses/repeater" },
            ];
            /* tslint:enable:max-line-length */
            a.forEach(k => {
                const o: K8sObject = {
                    apiVersion: k.apiVersion,
                    kind: k.kind,
                    metadata: {
                        name: "repeater",
                    },
                };
                if (k.ns) {
                    o.metadata.namespace = "fugazi";
                }
                const r = specUriPath(o, "patch");
                assert(r === k.e);
            });
        });

        it("should handle a variety of resources without names", () => {
            const a = [
                { apiVersion: "v1", kind: "Service", ns: true, e: "v1/namespaces/fugazi/services" },
                { apiVersion: "v1", kind: "ServiceAccount", ns: true, e: "v1/namespaces/fugazi/serviceaccounts" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role", ns: true, e: "rbac.authorization.k8s.io/v1/namespaces/fugazi/roles" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRole", ns: false, e: "rbac.authorization.k8s.io/v1/clusterroles" },
                { apiVersion: "extensions/v1beta1", kind: "NetworkPolicy", ns: true, e: "extensions/v1beta1/namespaces/fugazi/networkpolicies" },
                { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy", ns: true, e: "networking.k8s.io/v1/namespaces/fugazi/networkpolicies" },
                { apiVersion: "extensions/v1beta1", kind: "Ingress", ns: true, e: "extensions/v1beta1/namespaces/fugazi/ingresses" },
                { apiVersion: "extensions/v1beta1", kind: "DaemonSet", ns: true, e: "extensions/v1beta1/namespaces/fugazi/daemonsets" },
                { apiVersion: "extensions/v1beta1", kind: "DaemonSet", ns: true, e: "extensions/v1beta1/namespaces/fugazi/daemonsets" },
                { apiVersion: "apps/v1", kind: "DaemonSet", ns: true, e: "apps/v1/namespaces/fugazi/daemonsets" },
                { apiVersion: "extensions/v1beta1", kind: "Deployment", ns: true, e: "extensions/v1beta1/namespaces/fugazi/deployments" },
                { apiVersion: "apps/v1", kind: "Deployment", ns: true, e: "apps/v1/namespaces/fugazi/deployments" },
                { apiVersion: "storage.k8s.io/v1", kind: "StorageClass", ns: false, e: "storage.k8s.io/v1/storageclasses" },
            ];
            a.forEach(k => {
                const o: K8sObject = {
                    apiVersion: k.apiVersion,
                    kind: k.kind,
                };
                if (k.ns) {
                    o.metadata = { namespace: "fugazi" };
                }
                const r = specUriPath(o, "list");
                assert(r === k.e);
            });
        });

        it("should throw an error if kind missing", () => {
            const o = {
                apiVersion: "v1",
                metadata: {
                    name: "repeater",
                    namespace: "fugazi",
                },
            };
            assert.throws(() => specUriPath(o, "create"), /Spec does not contain kind:/);
        });

        it("should throw an error if name required and missing", () => {
            const o = {
                apiVersion: "v1",
                kind: "Service",
                metadata: {
                    namespace: "fugazi",
                },
            };
            assert.throws(() => specUriPath(o, "read"), /Spec does not contain name:/);
        });

    });

    describe("integration", function(): void {

        // tslint:disable-next-line:no-invalid-this
        this.timeout(5000);

        before(async function(): Promise<void> {
            try {
                // see if minikube is available and responding
                await execPromise("kubectl", ["config", "use-context", "minikube"]);
                await execPromise("kubectl", ["get", "--request-timeout=200ms", "pods"]);
            } catch (e) {
                // tslint:disable-next-line:no-invalid-this
                this.skip();
            }
        });

        it("should apply and delete a resource", async () => {
            const o = {
                apiVersion: "apps/v1",
                kind: "Deployment",
                metadata: {
                    name: `sdm-pack-k8s-api-int-${Math.floor(Math.random() * 100000)}`,
                    namespace: "default",
                },
                spec: {
                    selector: {
                        matchLabels: {
                            app: "sleep",
                        },
                    },
                    template: {
                        metadata: {
                            labels: {
                                app: "sleep",
                            },
                        },
                        spec: {
                            containers: [
                                {
                                    args: ["60"],
                                    command: ["sleep"],
                                    image: "alpine",
                                    name: "sleep",
                                },
                            ],
                        },
                    },
                },
            };
            await applySpec(o);
            const p0 = await execPromise("kubectl", ["get", "-n", o.metadata.namespace, "deployments"]);
            assert(p0.stdout.includes(o.metadata.name));
            await deleteSpec(o);
            const p1 = await execPromise("kubectl", ["get", "-n", o.metadata.namespace, "deployments"]);
            assert(!p1.stdout.includes(o.metadata.name));
        });

    });

});
