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

import {
    configurationValue,
    GitProject,
    guid,
    logger,
    Project,
    ProjectFile,
    projectUtils,
    RemoteRepoRef,
} from "@atomist/automation-client";
import {
    CachingProjectLoader,
    ProjectLoader,
    ProjectLoadingParameters,
} from "@atomist/sdm";
import {
    KubernetesSyncOptions,
    validSyncOptions,
} from "../config";
import { parseKubernetesSpecFile } from "../deploy/spec";
import { K8sObject } from "../kubernetes/api";
import {
    appName,
    KubernetesDelete,
} from "../kubernetes/request";
import {
    kubernetesSpecFileBasename,
    kubernetesSpecStringify,
    KubernetesSpecStringifyOptions,
} from "../kubernetes/spec";
import { cloneOptions } from "./clone";
import { k8sSpecGlob } from "./diff";
import { commitTag } from "./tag";

export type SyncAction = "upsert" | "delete";

/**
 * Synchronize changes from deploying app to the configured syncRepo.
 * If no syncRepo is configured, do nothing.
 *
 * @param app Kubernetes application change that triggered the sync
 * @param resources Kubernetes resource objects to synchronize
 * @param action Action performed, "upsert" or "delete"
 */
export async function syncApplication(app: KubernetesDelete, resources: K8sObject[], action: SyncAction = "upsert"): Promise<void> {
    const slug = appName(app);
    const syncOpts = configurationValue<Partial<KubernetesSyncOptions>>("sdm.k8s.options.sync", {});
    if (!validSyncOptions(syncOpts)) {
        return;
    }
    const syncRepo = syncOpts.repo as RemoteRepoRef;
    if (resources.length < 1) {
        return;
    }
    const projectLoadingParameters: ProjectLoadingParameters = {
        credentials: syncOpts.credentials,
        cloneOptions,
        id: syncRepo,
        readOnly: false,
    };
    const projectLoader = configurationValue<ProjectLoader>("sdm.projectLoader", new CachingProjectLoader());
    try {
        await projectLoader.doWithProject(projectLoadingParameters, syncResources(app, resources, action, syncOpts));
    } catch (e) {
        e.message = `Failed to perform sync resources from ${slug} to sync repo ${syncRepo.owner}/${syncRepo.repo}: ${e.message}`;
        logger.error(e.message);
        throw e;
    }
    return;
}

export interface ProjectFileSpec {
    file: ProjectFile;
    spec: K8sObject;
}

/**
 * Update the sync repo with the changed resources from a
 * KubernetesApplication.  For each changed resource in `resources`,
 * loop through all the existing Kubernetes spec files, i.e., those
 * that match [[k8sSpecGlob]], to see if the apiVersion, kind, name,
 * and namespace, which may be undefined, match.  If a match is found,
 * update that spec file.  If no match is found, create a unique file
 * name and store the resource spec in it.  If changes are made,
 * commit and push the changes.
 *
 * @param app Kubernetes application object
 * @param resources Resources that were upserted as part of this application
 * @param action Action performed, "upsert" or "delete"
 * @param opts Repo sync options, passed to the sync action
 * @return Function that updates the sync repo with the resource specs
 */
export function syncResources(
    app: KubernetesDelete,
    resources: K8sObject[],
    action: SyncAction,
    opts: KubernetesSyncOptions,
): (p: GitProject) => Promise<void> {

    return async syncProject => {
        const specs: ProjectFileSpec[] = [];
        await projectUtils.doWithFiles(syncProject, k8sSpecGlob, async file => {
            try {
                const spec = await parseKubernetesSpecFile(file);
                specs.push({ file, spec });
            } catch (e) {
                logger.warn(`Failed to process sync repo spec ${file.path}, ignoring: ${e.message}`);
            }
        });
        const [syncAction, syncVerb] = (action === "delete") ? [resourceDeleted, "Delete"] : [resourceUpserted, "Update"];
        for (const resource of resources) {
            const fileSpec = matchSpec(resource, specs);
            await syncAction(resource, syncProject, fileSpec, opts);
        }
        if (await syncProject.isClean()) {
            return;
        }
        try {
            await syncProject.commit(`${syncVerb} specs for ${appName(app)}\n\n[atomist:generated] ${commitTag()}\n`);
            await syncProject.push();
        } catch (e) {
            e.message = `Failed to commit and push resource changes to sync repo: ${e.message}`;
            logger.error(e.message);
            throw e;
        }
    };
}

/**
 * Persist the creation of or update to a resource to the sync repo
 * project.
 *
 * @param resource Kubernetes resource that was upserted
 * @param p Sync repo project
 * @param fs File and spec object that matches resource, may be undefined
 */
async function resourceUpserted(resource: K8sObject, p: Project, fs: ProjectFileSpec, opts: KubernetesSyncOptions): Promise<void> {
    const stringifyOptions: KubernetesSpecStringifyOptions = {
        format: (fs && fs.file && /\.ya?ml$/.test(fs.file.path)) ? "yaml" : "json",
        secretKey: opts.secretKey,
    };
    const resourceString = await kubernetesSpecStringify(resource, stringifyOptions);
    if (fs) {
        await fs.file.setContent(resourceString);
    } else {
        const specPath = await uniqueSpecFile(resource, p);
        await p.addFile(specPath, resourceString);
    }
}

/**
 * Persist the deletion of a resource to the sync repo project.
 *
 * @param resource Kubernetes resource that was upserted
 * @param p Sync repo project
 * @param fs File and spec object that matches resource, may be undefined
 */
async function resourceDeleted(resource: K8sObject, p: Project, fs: ProjectFileSpec): Promise<void> {
    if (fs) {
        await p.deleteFile(fs.file.path);
    }
}

/**
 * Search `fileSpecs` for a spec that matches `spec`.  To be
 * considered a match, the apiVersion, kind, name, and namespace,
 * which may be undefined, must match.
 *
 * @param spec Kubernetes object spec to match
 * @param fileSpecs Array of spec and file objects to search
 * @return First file and spec object to match spec or `undefined` if no match is found
 */
export function matchSpec(spec: K8sObject, fileSpecs: ProjectFileSpec[]): ProjectFileSpec | undefined {
    return fileSpecs.find(fs => spec.kind === fs.spec.kind &&
        spec.metadata.name === fs.spec.metadata.name &&
        spec.metadata.namespace === fs.spec.metadata.namespace);
}

/**
 * Return a unique name for a resource spec that lexically sorts so
 * resources that should be created earlier than others sort earlier
 * than others.
 *
 * @param resource Kubernetes object spec
 * @param p Kubernetes spec project
 * @return Unique spec file name that sorts properly
 */
export async function uniqueSpecFile(resource: K8sObject, p: Project): Promise<string> {
    const specRoot = kubernetesSpecFileBasename(resource);
    const specExt = ".json";
    let specPath = specRoot + specExt;
    while (await p.getFile(specPath)) {
        specPath = specRoot + "_" + guid().split("-")[0] + specExt;
    }
    return specPath;
}
