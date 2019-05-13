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

import * as assert from "power-assert";
import { KubernetesDelete } from "../../lib/kubernetes/request";
import { appObject } from "../../lib/kubernetes/resource";

describe("kubernetes/resource", () => {

    describe("k8sObject", () => {

        it("should throw an exception if kind invalid", () => {
            [undefined, "", "Nothing"].forEach(k => {
                const a: KubernetesDelete = {
                    name: "good-girl-gone-bad",
                    ns: "rihanna",
                    workspaceId: "AR14NN4",
                };
                assert.throws(() => appObject(a, k), /Unsupported kind of Kubernetes resource object:/);
            });
        });

        it("should return a namespace object", () => {
            const a: KubernetesDelete = {
                name: "good-girl-gone-bad",
                ns: "rihanna",
                workspaceId: "AR14NN4",
            };
            const o = appObject(a, "Namespace");
            const e = {
                apiVersion: "v1",
                kind: "Namespace",
                metadata: {
                    labels: {
                        "app.kubernetes.io/name": "good-girl-gone-bad",
                        "atomist.com/workspaceId": "AR14NN4",
                    },
                    name: "rihanna",
                },
            };
            assert.deepStrictEqual(o, e);
        });

        it("should return a v1 namespaced object", () => {
            ["Secret", "Service", "ServiceAccount"].forEach(k => {
                const a: KubernetesDelete = {
                    name: "good-girl-gone-bad",
                    ns: "rihanna",
                    workspaceId: "AR14NN4",
                };
                const o = appObject(a, k);
                const e = {
                    apiVersion: "v1",
                    kind: k,
                    metadata: {
                        labels: {
                            "app.kubernetes.io/name": "good-girl-gone-bad",
                            "atomist.com/workspaceId": "AR14NN4",
                        },
                        name: "good-girl-gone-bad",
                        namespace: "rihanna",
                    },
                };
                assert.deepStrictEqual(o, e);
            });
        });

        it("should return a v1beta1 namespaced object", () => {
            const a: KubernetesDelete = {
                name: "good-girl-gone-bad",
                ns: "rihanna",
                workspaceId: "AR14NN4",
            };
            const o = appObject(a, "Ingress");
            const e = {
                apiVersion: "extensions/v1beta1",
                kind: "Ingress",
                metadata: {
                    labels: {
                        "app.kubernetes.io/name": "good-girl-gone-bad",
                        "atomist.com/workspaceId": "AR14NN4",
                    },
                    name: "good-girl-gone-bad",
                    namespace: "rihanna",
                },
            };
            assert.deepStrictEqual(o, e);
        });

        it("should return a namespaced apps object", () => {
            const a: KubernetesDelete = {
                name: "good-girl-gone-bad",
                ns: "rihanna",
                workspaceId: "AR14NN4",
            };
            const o = appObject(a, "Deployment");
            const e = {
                apiVersion: "apps/v1",
                kind: "Deployment",
                metadata: {
                    labels: {
                        "app.kubernetes.io/name": "good-girl-gone-bad",
                        "atomist.com/workspaceId": "AR14NN4",
                    },
                    name: "good-girl-gone-bad",
                    namespace: "rihanna",
                },
            };
            assert.deepStrictEqual(o, e);
        });

        it("should return a namespaced RBAC object", () => {
            ["Role", "RoleBinding"].forEach(k => {
                const a: KubernetesDelete = {
                    name: "good-girl-gone-bad",
                    ns: "rihanna",
                    workspaceId: "AR14NN4",
                };
                const o = appObject(a, k);
                const e = {
                    apiVersion: "rbac.authorization.k8s.io/v1",
                    kind: k,
                    metadata: {
                        labels: {
                            "app.kubernetes.io/name": "good-girl-gone-bad",
                            "atomist.com/workspaceId": "AR14NN4",
                        },
                        name: "good-girl-gone-bad",
                        namespace: "rihanna",
                    },
                };
                assert.deepStrictEqual(o, e);
            });
        });

        it("should return a cluster RBAC object", () => {
            ["ClusterRole", "ClusterRoleBinding"].forEach(k => {
                const a: KubernetesDelete = {
                    name: "good-girl-gone-bad",
                    ns: "rihanna",
                    workspaceId: "AR14NN4",
                };
                const o = appObject(a, k);
                const e = {
                    apiVersion: "rbac.authorization.k8s.io/v1",
                    kind: k,
                    metadata: {
                        labels: {
                            "app.kubernetes.io/name": "good-girl-gone-bad",
                            "atomist.com/workspaceId": "AR14NN4",
                        },
                        name: "good-girl-gone-bad",
                    },
                };
                assert.deepStrictEqual(o, e);
            });
        });

    });

});