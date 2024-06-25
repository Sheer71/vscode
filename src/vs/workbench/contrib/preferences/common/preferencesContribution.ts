/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import * as nls from 'vs/nls';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import * as JSONContributionRegistry from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { EditorInputWithOptions } from 'vs/workbench/common/editor';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { RegisteredEditorPriority, IEditorResolverService } from 'vs/workbench/services/editor/common/editorResolverService';
import { ITextEditorService } from 'vs/workbench/services/textfile/common/textEditorService';
import { DEFAULT_SETTINGS_EDITOR_SETTING, FOLDER_SETTINGS_PATH, IPreferencesService, USE_SPLIT_JSON_SETTING } from 'vs/workbench/services/preferences/common/preferences';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { IJSONSchema, IJSONSchemaMap } from 'vs/base/common/jsonSchema';
import { JSONSchema } from 'vscode';
import { Lazy } from 'vs/base/common/lazy';

const schemaRegistry = Registry.as<JSONContributionRegistry.IJSONContributionRegistry>(JSONContributionRegistry.Extensions.JSONContribution);

export class PreferencesContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.preferences';

	private editorOpeningListener: IDisposable | undefined;
	private settingsListener: IDisposable;

	constructor(
		@IModelService private readonly modelService: IModelService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
		@ITextEditorService private readonly textEditorService: ITextEditorService
	) {
		this.settingsListener = this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(USE_SPLIT_JSON_SETTING) || e.affectsConfiguration(DEFAULT_SETTINGS_EDITOR_SETTING)) {
				this.handleSettingsEditorRegistration();
			}
		});
		this.handleSettingsEditorRegistration();

		this.start();
	}

	private handleSettingsEditorRegistration(): void {

		// dispose any old listener we had
		dispose(this.editorOpeningListener);

		// install editor opening listener unless user has disabled this
		if (!!this.configurationService.getValue(USE_SPLIT_JSON_SETTING) || !!this.configurationService.getValue(DEFAULT_SETTINGS_EDITOR_SETTING)) {
			this.editorOpeningListener = this.editorResolverService.registerEditor(
				'**/settings.json',
				{
					id: SideBySideEditorInput.ID,
					label: nls.localize('splitSettingsEditorLabel', "Split Settings Editor"),
					priority: RegisteredEditorPriority.builtin,
				},
				{},
				{
					createEditorInput: ({ resource, options }): EditorInputWithOptions => {
						// Global User Settings File
						if (isEqual(resource, this.userDataProfileService.currentProfile.settingsResource)) {
							return { editor: this.preferencesService.createSplitJsonEditorInput(ConfigurationTarget.USER_LOCAL, resource), options };
						}

						// Single Folder Workspace Settings File
						const state = this.workspaceService.getWorkbenchState();
						if (state === WorkbenchState.FOLDER) {
							const folders = this.workspaceService.getWorkspace().folders;
							if (isEqual(resource, folders[0].toResource(FOLDER_SETTINGS_PATH))) {
								return { editor: this.preferencesService.createSplitJsonEditorInput(ConfigurationTarget.WORKSPACE, resource), options };
							}
						}

						// Multi Folder Workspace Settings File
						else if (state === WorkbenchState.WORKSPACE) {
							const folders = this.workspaceService.getWorkspace().folders;
							for (const folder of folders) {
								if (isEqual(resource, folder.toResource(FOLDER_SETTINGS_PATH))) {
									return { editor: this.preferencesService.createSplitJsonEditorInput(ConfigurationTarget.WORKSPACE_FOLDER, resource), options };
								}
							}
						}

						return { editor: this.textEditorService.createTextEditor({ resource }), options };
					}
				}
			);
		}
	}

	private start(): void {

		this.textModelResolverService.registerTextModelContentProvider('vscode', {
			provideTextContent: async (uri: URI): Promise<ITextModel | null> => {
				if (uri.scheme !== 'vscode') {
					return null;
				}
				if (uri.authority === 'schemas') {
					return this.getSchemaModel(uri);
				}
				return this.preferencesService.resolveModel(uri);
			}
		});
	}

	private getSchemaModel(uri: URI): ITextModel {

		const definitions = new Map<string, JSONSchema>();

		class Definition {
			constructor(public name: string, public schema: JSONSchema) {
			}
		}

		class Cache {
			nodesForProperty: JSONSchema[] = [];
			nodesByString = new Lazy<Map<JSONSchema, string>>(() => {
				const nodeToString = new Map<JSONSchema, Definition>();
				for (const node of this.nodesForProperty) {
					const stringToDefinition = new Map<string, Definition>();
					const str = JSON.stringify(node);
					const otherNode = stringToNode.get(str);
					if (otherNode) {
						nodeToString.set(otherNode, str);
						nodeToString.set(node, str);
					} else {
						stringToNode.set(str, node);
					}
				}
				return nodeToString;
			}



		}



		const getModelContent = (schema: IJSONSchema) => {
			const start = new Date();

			const nodeByProperty = new Map<string, IJSONSchema[]>();
			const groupByProperty = (property: string, next: IJSONSchema) => {
				let nodes = nodeByProperty.get(property);
				if (!nodes) {
					nodes = [];
					nodeByProperty.set(property, nodes);
				}
				nodes.push(next);
				return true;
			};
			traverseNodes(schema, groupByProperty);

			const defByString = new Map<string, Definition>();
			const nodeToDefinition = new Map<string, Definition>();
			for (const [property, nodes] of nodeByProperty) {
				if (nodes.length > 1) {
					for (const node of nodes) {
						const str = JSON.stringify(node);
						let def = defByString.get(str);
						if (def) {

						}
					}
				}


			}



			const nodeByString = new Map<string, IJSONSchema[]>();
			const externalize = (property: string, next: IJSONSchema) => {
				let nodes = nodeByProperty.get(property);
				if (!nodes || nodes.length < 2) {
					// don't externalize if there is only one node at this property
					return true;
				}
				let nextStr = undefined;
				for (const node of nodes) {
					const str = JSON.stringify(node);
					if (node === next) {
						nextStr = str;
					}
					let nodes = nodeByString.get(str);
					if (!nodes) {
						nodes = [];
						nodeByString.set(property, nodes);
					}
					nodes.push(node);
				}
				if (nodeByString.get(nextStr!)!.length > 1) {

				}


				if (!nodes) {
					nodes = [];
					nodeByProperty.set(property, nodes);
				}
				nodes.push(next);
				return true;
			};

		}




		const groupByProperty = (property: string, next: IJSONSchema) => {
			let nodes = nodeByProperty.get(property);
			if (!nodes) {
				nodes = [];
				nodeByProperty.set(property, nodes);
			}
			nodes.push(next);
			return true;
		};


		for (const [property, nodes] of nodeByProperty) {
			if (nodes.length > 1) {
				const nodeBy


				console.log(`Found duplicate property ${property} in schema ${uri}:`);
				for (const node of nodes) {
					console.log(JSON.stringify(node));
				}
			}
		}




		console.log(`Found ${nDups} duplicates in schema ${uri}. Took ${new Date().getTime() - start.getTime()}ms.`);

		return JSON.stringify(schema);
	};


		let schema = schemaRegistry.getSchemaContributions().schemas[uri.toString()] ?? {} /* Use empty schema if not yet registered */;
const modelContent = getModelContent(schema);
const languageSelection = this.languageService.createById('jsonc');
const model = this.modelService.createModel(modelContent, languageSelection, uri);
const disposables = new DisposableStore();
disposables.add(schemaRegistry.onDidChangeSchema(schemaUri => {
	if (schemaUri === uri.toString()) {
		schema = schemaRegistry.getSchemaContributions().schemas[uri.toString()];
		model.setValue(getModelContent(schema));
	}
}));
disposables.add(model.onWillDispose(() => disposables.dispose()));
return model;
	}

dispose(): void {
	dispose(this.editorOpeningListener);
	dispose(this.settingsListener);
}
}

type IJSONSchemaRef = IJSONSchema | boolean;
export function isObject(val: any): val is object {
	return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function traverseNodes(root: IJSONSchema, visit: (property: string, schema: IJSONSchema) => boolean) {
	if (!root || typeof root !== 'object') {
		return;
	}
	const collectEntries = (...entries: (IJSONSchemaRef | undefined)[]) => {
		for (const entry of entries) {
			if (isObject(entry)) {
				toWalk.push(entry);
			}
		}
	};
	const collectMapEntries = (...maps: (IJSONSchemaMap | undefined)[]) => {
		for (const map of maps) {
			if (isObject(map)) {
				for (const key in map) {
					const entry = map[key];
					if (isObject(entry)) {
						toWalk.push([key, entry]);
					}
				}
			}
		}
	};
	const collectArrayEntries = (...arrays: (IJSONSchemaRef[] | undefined)[]) => {
		for (const array of arrays) {
			if (Array.isArray(array)) {
				for (const entry of array) {
					if (isObject(entry)) {
						toWalk.push(entry);
					}
				}
			}
		}
	};
	const collectEntryOrArrayEntries = (items: (IJSONSchemaRef[] | IJSONSchemaRef | undefined)) => {
		if (Array.isArray(items)) {
			for (const entry of items) {
				if (isObject(entry)) {
					toWalk.push(entry);
				}
			}
		} else if (isObject(items)) {
			toWalk.push(items);
		}
	};

	const toWalk: (IJSONSchema | [string, IJSONSchema])[] = [root];

	let next = toWalk.pop();
	while (next) {
		let visitChildern = true;
		if (Array.isArray(next)) {
			visitChildern = visit(next[0], next[1]);
			next = next[1];
		}
		if (visitChildern) {
			collectEntries(next.additionalItems, next.additionalProperties, next.not, next.contains, next.propertyNames, next.if, next.then, next.else, next.unevaluatedItems, next.unevaluatedProperties);
			collectMapEntries(next.definitions, next.$defs, next.properties, next.patternProperties, <IJSONSchemaMap>next.dependencies, next.dependentSchemas);
			collectArrayEntries(next.anyOf, next.allOf, next.oneOf, next.prefixItems);
			collectEntryOrArrayEntries(next.items);
		}
		next = toWalk.pop();
	}
}

// Remove the unused function declaration
// function toStringWithReuse(schema: IJSONSchema) {
// 	const map = new Map<string, string>();

// 	function visit(schema: IJSONSchema) {
// 		if (schema.properties) {
// 			for (const key in schema.properties) {
// 				visit(schema.properties[key]);
// 			}
// 		} else {
// 			const str = JSON.stringify(schema);
// 			hash()
// 		}



// 		const key = JSON.stringify(schema);
// 		if (map.has(key)) {
// 			return map.get(key);
// 		}
// 		const result = doVisit(schema);
// 		map.set(key, result);
// 		return result;
// 	}


// 	if (schema.properties) {

// 	}
// }

const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
registry.registerConfiguration({
	...workbenchConfigurationNodeBase,
	'properties': {
		'workbench.settings.enableNaturalLanguageSearch': {
			'type': 'boolean',
			'description': nls.localize('enableNaturalLanguageSettingsSearch', "Controls whether to enable the natural language search mode for settings. The natural language search is provided by a Microsoft online service."),
			'default': true,
			'scope': ConfigurationScope.WINDOW,
			'tags': ['usesOnlineServices']
		},
		'workbench.settings.settingsSearchTocBehavior': {
			'type': 'string',
			'enum': ['hide', 'filter'],
			'enumDescriptions': [
				nls.localize('settingsSearchTocBehavior.hide', "Hide the Table of Contents while searching."),
				nls.localize('settingsSearchTocBehavior.filter', "Filter the Table of Contents to just categories that have matching settings. Clicking on a category will filter the results to that category."),
			],
			'description': nls.localize('settingsSearchTocBehavior', "Controls the behavior of the Settings editor Table of Contents while searching. If this setting is being changed in the Settings editor, the setting will take effect after the search query is modified."),
			'default': 'filter',
			'scope': ConfigurationScope.WINDOW
		},
	}
});
