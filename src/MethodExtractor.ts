import { ClassAnalyer, SourceAnalyser, SourceFileDescriptor } from 'dotup-vscode-api-extensions';
import * as fs from 'fs';
import { ClassLikeDeclaration, ImportDeclaration, MethodSignature, NamedImports, SyntaxKind, TypeReferenceNode } from 'typescript';
import * as vscode from 'vscode';
import { FileFinder } from './FileFinder';
import { TypeDefinitionAnalyser } from './TypeDefinitionAnalyser';

export class MethodExtractor {

	constructor() {
	}

	// async getExtendedFile(): void {

	// }
	async getMethodSignatures(document: vscode.TextDocument, position: vscode.Position, out: vscode.OutputChannel): Promise<MethodSignature[]> {
		const analyser = new SourceAnalyser();
		const sourceDescriptor = analyser.analyse('tmp', document.getText());
		const className = this.getClassNameToOverrideFrom(sourceDescriptor, position);

		// Could not find class name
		if (className === undefined) {
			return;
		}

		const importDeclaration = this.getImportDeclaration(sourceDescriptor, className);

		// File has no import statements
		let cDec;
		if (importDeclaration) {
			const dts = new FileFinder();
			const definitionFilePath = dts.find(document.uri.fsPath, importDeclaration, className);
			const dtsContent = fs.readFileSync(definitionFilePath, 'UTF-8');
	
			const ana = new SourceAnalyser();
			cDec = ana.analyse('tmp', dtsContent);
			cDec = cDec.classDeclarations.find(x => {
				let dec = x as ClassLikeDeclaration;
				let clsName = dec.name.getText();
				return clsName == className;
			});
		} else {
			cDec = sourceDescriptor.classDeclarations.find(x => {
				let dec = x as ClassLikeDeclaration;
				let clsName = dec.name.getText();
				return clsName == className;
			});
		}

		const ca = new ClassAnalyer();
		const classDescriptor = ca.getClassDescriptor(cDec as any);
		let methods: MethodSignature[] = [];
		for (const method of classDescriptor.classDeclaration.members) {
			if (method.kind == SyntaxKind.MethodDeclaration) {
				// is private ?
				let isPrivate = false;
				if (method.modifiers) {
					for (const m of method.modifiers) {
						if (m.kind == SyntaxKind.PrivateKeyword) {
							isPrivate = true;
							break;
						}
					}
				}
				if (!isPrivate) methods.push(method as any);
			}
		}
		return methods;
	}

	getClassNameToOverrideFrom(sourceDescriptor: SourceFileDescriptor, position: vscode.Position): string {

		// Is there a valid source file?
		if (sourceDescriptor.isSourceValid()) {

			const classToOverrideFrom = sourceDescriptor.classDescriptors.find(descriptor => {
				const cd = descriptor.classDeclaration;
				const lineAndCharacterPos = cd.getSourceFile().getLineAndCharacterOfPosition(cd.name.pos);
				const lineAndCharacterEnd = cd.getSourceFile().getLineAndCharacterOfPosition(cd.end);
				return (position.line > lineAndCharacterPos.line && position.line < lineAndCharacterEnd.line);
			});

			// We are not in a class declaration
			if (classToOverrideFrom === undefined) {
				return;
			}

			const clause = classToOverrideFrom.classDeclaration.heritageClauses.find(x => x.token === SyntaxKind.ExtendsKeyword);

			// Class does not extend anything
			if (clause === undefined) {
				return;
			}

			let className = clause.types[0].getText();
			const idxOfT = className.indexOf('<');
			if (idxOfT != -1) {
				className = className.substring(0, idxOfT).trim();
			}

			return className;
			return clause.types[0].getText();
		}
	}

	getImportDeclaration(sourceDescriptor: SourceFileDescriptor, className: string): ImportDeclaration {
		const extendsSource = sourceDescriptor.importClause.find(imp => {
			const x: ImportDeclaration = <ImportDeclaration>imp;
			const txt = x.moduleSpecifier.getText().replace(/["']/g, '');
			let arr = txt.split('/');
			return arr[arr.length-1] == className;
		});

		return <ImportDeclaration>extendsSource;
	}

	isAsyncMethod(method: MethodSignature): boolean {
		if (method.type === undefined) {
			return false;
		}

		switch (method.type.kind) {
			case SyntaxKind.TypeReference:
				return (<TypeReferenceNode>method.type).typeName.getText() === 'Promise';

			default:
				return false;
		}

	}

}

