/*
 * Copyright © 2018 Atomist, Inc.
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
    ExtensionPack,
    metadata,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import { isInLocalMode } from "@atomist/sdm-core";
import * as _ from "lodash";
import {
    kubeUndeploy,
} from "./commands/kubeUndeploy";
import {
    kubernetesDeploy,
} from "./events/kubeDeploy";
import {
    getKubeConfig,
    loadKubeConfig,
} from "./support/api";
import {
    minikubeStartupListener,
} from "./support/minikube";

/**
 * Configuration options to be passed to the Extension Pack creation.
 */
export interface KubernetesOptions {
    context?: string;
    addCommands?: boolean;
}

/**
 * Register Kubernetes deployment support for provided goals.
 * @param {KubernetesOptions} options
 * @returns {ExtensionPack}
 */
export function kubernetesSupport(options: KubernetesOptions = {}): ExtensionPack {
    return {
        ...metadata(),
        configure: sdm => {

            sdm.addEvent(kubernetesDeploy);
            if (options.addCommands) {
                sdm.addCommand(kubeUndeploy);
            }

            if (isInLocalMode()) {

                // set up the kube context
                const context = configureContext(sdm, options);

                // if we are using minikube, set the docker-env too
                if (context === "minikube") {
                    sdm.addStartupListener(minikubeStartupListener);
                }
            }
        },
    };
}

function configureContext(sdm: SoftwareDeliveryMachine, options: KubernetesOptions): string {
    const kubeConfig = loadKubeConfig();
    const contexts = kubeConfig.contexts.map((c: any) => c.context.cluster);
    let context: string;

    // Assign context
    if (options.context) {
        context = options.context;
    } else if (!_.get(sdm, "configuration.sdm.k8.context")) {
        if (contexts.includes("minikube")) {
            context = "minikube";
        } else {
            context = kubeConfig["current-context"];
        }
    }

    try {
        // Validate context
        getKubeConfig(context);
    } catch (err) {
        throw new Error(`Failed to load Kubernetes cluster context '${context}'. Available contexts are: ` +
            contexts.join(", "));
    }

    _.set(sdm, "configuration.sdm.k8.context", context);
    return context;
}
