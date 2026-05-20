/**
 * Shared path resolution for the audit pipeline.
 *
 * Two roots are in play:
 *   - skillDir     : this skill's own folder, found from the script's location
 *                    (import.meta.url) so it works regardless of which mirror
 *                    path the skill is loaded from. The `audit/` working
 *                    directory lives here — it is used only by this skill.
 *   - projectRoot  : the process working directory, where `images/` and `src/`
 *                    live. Scripts must be run from the project root.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
export const skillDir = dirname(scriptsDir);
export const auditDir = join(skillDir, 'audit');
export const dataDir = join(skillDir, 'data');

export const projectRoot = process.cwd();
export const imagesDir = join(projectRoot, 'images');
export const cardHelpers = join(projectRoot, 'src/utils/cardHelpers.ts');
