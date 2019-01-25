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

import * as fs from "fs-extra";
import * as path from "path";

/** Get this projects package information. */
export async function pkgInfo(): Promise<string> {
    const p = await fs.readJson(path.join(__dirname, "..", "..", "package.json"));
    return `${p.name}_${p.version}`.replace(/^@/, "").replace(/[^-A-Za-z0-9_.]+/g, "_");
}
