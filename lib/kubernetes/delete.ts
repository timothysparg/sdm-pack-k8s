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

import { logger } from "@atomist/automation-client";
import * as k8s from "@kubernetes/client-node";
import { errMsg } from "../support/error";
import { logRetry } from "../support/retry";
import {
    isClusterResource,
    K8sDeleteResponse,
    K8sListResponse,
    K8sObject,
    K8sObjectApi,
    specUriPath,
} from "./api";
import { loadKubeConfig } from "./config";
import { labelSelector } from "./labels";
import {
    appName,
    KubernetesDeleteResourceRequest,
} from "./request";
import { stringifyObject } from "./resource";

/**
 * Delete a resource if it exists.  If the resource does not exist,
 * do nothing.
 *
 * @param spec Kuberenetes spec of resource to delete
 * @return DeleteResponse if object existed and was deleted, undefined if it did not exist
 */
export async function deleteSpec(spec: K8sObject): Promise<K8sDeleteResponse | undefined> {
    const slug = specUriPath(spec, "read");
    let client: K8sObjectApi;
    try {
        const kc = loadKubeConfig();
        client = kc.makeApiClient(K8sObjectApi);
    } catch (e) {
        e.message = `Failed to create Kubernetes client: ${errMsg(e)}`;
        logger.error(e.message);
        throw e;
    }
    try {
        await client.read(spec);
    } catch (e) {
        logger.debug(`Kubernetes resource ${slug} does not exist: ${errMsg(e)}`);
        return undefined;
    }
    logger.info(`Deleting resource ${slug} using '${stringifyObject(spec)}'`);
    return logRetry(() => client.delete(spec), `delete resource ${slug}`);
}

/** Collection deleter for namespaced resources. */
export type K8sNamespacedLister = (
    namespace: string,
    pretty?: string,
    allowWatchBookmarks?: boolean,
    continu?: string,
    fieldSelector?: string,
    labelSelector?: string,
    limit?: number,
    resourceVersion?: string,
    timeoutSeconds?: number,
    watch?: boolean,
    options?: any,
) => Promise<K8sListResponse>;

/** Collection deleter for cluster resources. */
export type K8sClusterLister = (
    pretty?: string,
    allowWatchBookmarks?: boolean,
    continu?: string,
    fieldSelector?: string,
    labelSelector?: string,
    limit?: number,
    resourceVersion?: string,
    timeoutSeconds?: number,
    watch?: boolean,
    options?: any,
) => Promise<K8sListResponse>;

/** Collection deleter for namespaced resources. */
export type K8sNamespacedDeleter = (
    name: string,
    namespace: string,
    pretty?: string,
    dryRun?: string,
    gracePeriodSeconds?: number,
    orphanDependents?: boolean,
    propagationPolicy?: string,
    body?: k8s.V1DeleteOptions,
    options?: any,
) => Promise<K8sDeleteResponse>;

/** Collection deleter for cluster resources. */
export type K8sClusterDeleter = (
    name: string,
    pretty?: string,
    dryRun?: string,
    gracePeriodSeconds?: number,
    orphanDependents?: boolean,
    propagationPolicy?: string,
    body?: k8s.V1DeleteOptions,
    options?: any,
) => Promise<K8sDeleteResponse>;

/** Arguments for [[deleteAppResources]]. */
export interface DeleteAppResourcesArg {
    /** Resource kind, e.g., "Service". */
    kind: string;
    /** Delete request object. */
    req: KubernetesDeleteResourceRequest;
    /** API object to use as `this` for lister and deleter. */
    api: k8s.CoreV1Api | k8s.AppsV1Api | k8s.ExtensionsV1beta1Api | k8s.RbacAuthorizationV1Api;
    /** Resource collection deleting function. */
    lister: K8sNamespacedLister | K8sClusterLister;
    /** Resource collection deleting function. */
    deleter: K8sNamespacedDeleter | K8sClusterDeleter;
}

/**
 * Delete resources associated with application described by `arg.req`, if
 * any exists.  If no matching resources exist, do nothing.  Return
 * ann array of deleted resources, which may be empty.
 *
 * @param arg Specification of what and how to delete for what application
 * @return Array of deleted resources
 */
export async function deleteAppResources(arg: DeleteAppResourcesArg): Promise<K8sObject[]> {
    const slug = appName(arg.req);
    const selector = labelSelector(arg.req);
    const clusterResource = isClusterResource("list", arg.kind);
    const toDelete: K8sObject[] = [];
    try {
        const args = [arg.req.ns, undefined, undefined, undefined, undefined, selector];
        if (clusterResource) {
            args.shift();
        }
        const listResp = await (arg.lister as any).apply(arg.api, args);
        toDelete.push(...(listResp.body.items as K8sObject[]).map(r => {
            r.kind = r.kind || arg.kind; // list response does not include kind
            return r;
        }));
    } catch (e) {
        e.message = `Failed to list ${arg.kind} for ${slug}: ${errMsg(e)}`;
        logger.error(e.message);
        throw e;
    }
    const deleted: K8sObject[] = [];
    const errs: Error[] = [];
    for (const resource of toDelete) {
        const resourceSlug = clusterResource ? `${arg.kind}/${resource.metadata.name}` :
            `${arg.kind}/${resource.metadata.namespace}/${resource.metadata.name}`;
        logger.info(`Deleting ${resourceSlug} for ${slug}`);
        try {
            const args = [resource.metadata.name, resource.metadata.namespace, undefined, undefined, undefined, undefined, "Background"];
            if (clusterResource) {
                args.splice(1, 1);
            }
            await (arg.deleter as any).apply(arg.api, args);
            deleted.push(resource);
        } catch (e) {
            e.message = `Failed to delete ${resourceSlug} for ${slug}: ${errMsg(e)}`;
            errs.push(e);
        }
    }
    if (errs.length > 0) {
        const msg = `Failed to delete ${arg.kind} resources for ${slug}: ${errs.map(e => e.message).join("; ")}`;
        logger.error(msg);
        throw new Error(msg);
    }
    return deleted;
}
