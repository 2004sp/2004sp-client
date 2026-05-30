import AnimBase, { AnimTransform } from '#/dash3d/AnimBase.js';
import AnimFrame from '#/dash3d/AnimFrame.js';
import Pix2D from '#/dash3d/graphics/Pix2D.js';
import Pix3D from '#/dash3d/Pix3D.js';
import HDRenderer from '#/hd/ThreeRenderer.js';

import Packet from '#/io/Packet.js';

import { Int32Array2d, TypedArray1d } from '#/util/Arrays.js';
import PointNormal from '#/dash3d/PointNormal.js';
import ModelSource from '#/dash3d/ModelSource.js';
import type OnDemandProvider from '#/io/OnDemandProvider.js';

class Metadata {
    src: Uint8Array | null = null;

    vertexCount: number = 0;
    faceCount: number = 0;
    faceTextureCount: number = 0;

    vertexOrderOffset: number = -1;
    vertexXOffset: number = -1;
    vertexYOffset: number = -1;
    vertexZOffset: number = -1;
    vertexLabelOffset: number = -1;

    faceIndexOffset: number = -1;
    faceIndexOrderOffset: number = -1;
    faceColourOffset: number = -1;
    faceRenderTypeOffset: number = -1;
    facePriorityOffset: number = 0;
    faceAlphaOffset: number = -1;
    faceLabelOffset: number = -1;

    faceTextureAxisOffset: number = -1;
}

export default class Model extends ModelSource {
    static loaded: number = 0;
    static meta: (Metadata | null)[] = [];
    static provider: OnDemandProvider;

    // unlit model

    static tmpVertexX: Int32Array = new Int32Array(2000);
    static tmpVertexY: Int32Array = new Int32Array(2000);
    static tmpVertexZ: Int32Array = new Int32Array(2000);

    vertexCount: number = 0;
    vertexX: Int32Array | null = null;
    vertexY: Int32Array | null = null;
    vertexZ: Int32Array | null = null;

    faceCount: number = 0;
    faceVertexA: Int32Array | null = null;
    faceVertexB: Int32Array | null = null;
    faceVertexC: Int32Array | null = null;
    faceRenderType: Int32Array | null = null;
    facePriority: Int32Array | null = null;
    faceAlpha: Int32Array | null = null;
    faceColour: Int32Array | null = null;
    priority: number = 0;

    faceTextureCount: number = 0;
    faceTextureP: Int32Array | null = null;
    faceTextureM: Int32Array | null = null;
    faceTextureN: Int32Array | null = null;

    vertexLabel: Int32Array | null = null;
    faceLabel: Int32Array | null = null;
    labelVertices: (Int32Array | null)[] | null = null;
    labelFaces: (Int32Array | null)[] | null = null;

    vertexNormalOriginal: (PointNormal | null)[] | null = null;

    maxY: number = 0;
    minX: number = 0;
    maxX: number = 0;
    minZ: number = 0;
    maxZ: number = 0;

    objRaise: number = 0;

    // lit model

    static tempModel: Model = new Model();
    static tempFTran: Int32Array = new Int32Array(2000);

    faceColourA: Int32Array | null = null;
    faceColourB: Int32Array | null = null;
    faceColourC: Int32Array | null = null;

    useAABBMouseCheck: boolean = false;
    radius: number = 0;
    maxDepth: number = 0;
    minDepth: number = 0;

    static faceClippedX: boolean[] = new TypedArray1d(4096, false);
    static faceNearClipped: boolean[] = new TypedArray1d(4096, false);

    static vertexScreenX: Int32Array = new Int32Array(4096);
    static vertexScreenY: Int32Array = new Int32Array(4096);
    static vertexScreenZ: Int32Array = new Int32Array(4096);

    static vertexViewSpaceX: Int32Array = new Int32Array(4096);
    static vertexViewSpaceY: Int32Array = new Int32Array(4096);
    static vertexViewSpaceZ: Int32Array = new Int32Array(4096);

    static tmpDepthFaceCount: Int32Array = new Int32Array(1500);
    static tmpDepthFaces: Int32Array[] = new Int32Array2d(1500, 512);
    static tmpPriorityFaceCount: Int32Array = new Int32Array(12);
    static tmpPriorityFaces: Int32Array[] = new Int32Array2d(12, 2000);
    static tmpPriority10FaceDepth: Int32Array = new Int32Array(2000);
    static tmpPriority11FaceDepth: Int32Array = new Int32Array(2000);
    static tmpPriorityDepthSum: Int32Array = new Int32Array(12);

    static clippedX: Int32Array = new Int32Array(10);
    static clippedY: Int32Array = new Int32Array(10);
    static clippedColour: Int32Array = new Int32Array(10);

    static oX: number = 0; // animation origin x
    static oY: number = 0; // animation origin y
    static oZ: number = 0; // animation origin z

    static mouseCheck: boolean = false;
    static mouseX: number = 0;
    static mouseY: number = 0;
    static pickedCount: number = 0;
    static pickedEntityTypecode: Int32Array = new Int32Array(1000);

    static init(total: number, provider: OnDemandProvider) {
        Model.meta = new Array(total);
        Model.provider = provider;
    }

    static unpack(id: number, src: Uint8Array | null) {
        if (!src) {
            const meta = (Model.meta[id] = new Metadata());
            meta.vertexCount = 0;
            meta.faceCount = 0;
            meta.faceTextureCount = 0;
            return;
        }

        const trailer = new Packet(src);
        trailer.pos = src.length - 18;

        const meta = (Model.meta[id] = new Metadata());
        meta.src = src;
        meta.vertexCount = trailer.g2();
        meta.faceCount = trailer.g2();
        meta.faceTextureCount = trailer.g1();

        const hasRenderType = trailer.g1();
        const priority = trailer.g1();
        const hasAlpha = trailer.g1();
        const hasFaceLabels = trailer.g1();
        const hasVertexLabels = trailer.g1();

        const dataLengthX = trailer.g2();
        const dataLengthY = trailer.g2();
        const dataLengthZ = trailer.g2();
        const dataLengthFaceIndex = trailer.g2();

        let pos = 0;

        meta.vertexOrderOffset = pos;
        pos += meta.vertexCount;

        meta.faceIndexOrderOffset = pos;
        pos += meta.faceCount;

        meta.facePriorityOffset = pos;
        if (priority === 255) {
            pos += meta.faceCount;
        } else {
            meta.facePriorityOffset = -priority - 1;
        }

        meta.faceLabelOffset = pos;
        if (hasFaceLabels === 1) {
            pos += meta.faceCount;
        } else {
            meta.faceLabelOffset = -1;
        }

        meta.faceRenderTypeOffset = pos;
        if (hasRenderType === 1) {
            pos += meta.faceCount;
        } else {
            meta.faceRenderTypeOffset = -1;
        }

        meta.vertexLabelOffset = pos;
        if (hasVertexLabels === 1) {
            pos += meta.vertexCount;
        } else {
            meta.vertexLabelOffset = -1;
        }

        meta.faceAlphaOffset = pos;
        if (hasAlpha === 1) {
            pos += meta.faceCount;
        } else {
            meta.faceAlphaOffset = -1;
        }

        meta.faceIndexOffset = pos;
        pos += dataLengthFaceIndex;

        meta.faceColourOffset = pos;
        pos += meta.faceCount * 2;

        meta.faceTextureAxisOffset = pos;
        pos += meta.faceTextureCount * 6;

        meta.vertexXOffset = pos;
        pos += dataLengthX;

        meta.vertexYOffset = pos;
        pos += dataLengthY;

        meta.vertexZOffset = pos;
        pos += dataLengthZ;
    }

    static unload(id: number) {
        Model.meta[id] = null;
    }

    static load(id: number): Model | null {
        const meta = Model.meta[id];
        if (!meta) {
            Model.provider.requestModel(id);
            return null;
        }

        const model = new Model();
        Model.loaded++;

        model.vertexCount = meta.vertexCount;
        model.faceCount = meta.faceCount;
        model.faceTextureCount = meta.faceTextureCount;

        model.vertexX = new Int32Array(model.vertexCount);
        model.vertexY = new Int32Array(model.vertexCount);
        model.vertexZ = new Int32Array(model.vertexCount);

        model.faceVertexA = new Int32Array(model.faceCount);
        model.faceVertexB = new Int32Array(model.faceCount);
        model.faceVertexC = new Int32Array(model.faceCount);

        model.faceTextureP = new Int32Array(model.faceTextureCount);
        model.faceTextureM = new Int32Array(model.faceTextureCount);
        model.faceTextureN = new Int32Array(model.faceTextureCount);

        if (meta.vertexLabelOffset >= 0) {
            model.vertexLabel = new Int32Array(model.vertexCount);
        }

        if (meta.faceRenderTypeOffset >= 0) {
            model.faceRenderType = new Int32Array(model.faceCount);
        }

        if (meta.facePriorityOffset >= 0) {
            model.facePriority = new Int32Array(model.faceCount);
        } else {
            model.priority = -meta.facePriorityOffset - 1;
        }

        if (meta.faceAlphaOffset >= 0) {
            model.faceAlpha = new Int32Array(model.faceCount);
        }

        if (meta.faceLabelOffset >= 0) {
            model.faceLabel = new Int32Array(model.faceCount);
        }

        model.faceColour = new Int32Array(model.faceCount);

        const point1 = new Packet(meta.src);
        point1.pos = meta.vertexOrderOffset;

        const point2 = new Packet(meta.src);
        point2.pos = meta.vertexXOffset;

        const point3 = new Packet(meta.src);
        point3.pos = meta.vertexYOffset;

        const point4 = new Packet(meta.src);
        point4.pos = meta.vertexZOffset;

        const point5 = new Packet(meta.src);
        point5.pos = meta.vertexLabelOffset;

        let dx = 0;
        let dy = 0;
        let dz = 0;
        for (let v = 0; v < model.vertexCount; v++) {
            const order = point1.g1();

            let x = 0;
            if ((order & 0x1) !== 0) {
                x = point2.gsmart();
            }

            let y = 0;
            if ((order & 0x2) !== 0) {
                y = point3.gsmart();
            }

            let z = 0;
            if ((order & 0x4) !== 0) {
                z = point4.gsmart();
            }

            model.vertexX[v] = dx + x;
            model.vertexY[v] = dy + y;
            model.vertexZ[v] = dz + z;

            dx = model.vertexX[v];
            dy = model.vertexY[v];
            dz = model.vertexZ[v];

            if (model.vertexLabel !== null) {
                model.vertexLabel[v] = point5.g1();
            }
        }

        const face1 = new Packet(meta.src);
        face1.pos = meta.faceColourOffset;

        const face2 = new Packet(meta.src);
        face2.pos = meta.faceRenderTypeOffset;

        const face3 = new Packet(meta.src);
        face3.pos = meta.facePriorityOffset;

        const face4 = new Packet(meta.src);
        face4.pos = meta.faceAlphaOffset;

        const face5 = new Packet(meta.src);
        face5.pos = meta.faceLabelOffset;

        for (let f = 0; f < model.faceCount; f++) {
            model.faceColour[f] = face1.g2();

            if (model.faceRenderType !== null) {
                model.faceRenderType[f] = face2.g1();
            }

            if (model.facePriority !== null) {
                model.facePriority[f] = face3.g1();
            }

            if (model.faceAlpha !== null) {
                model.faceAlpha[f] = face4.g1();
            }

            if (model.faceLabel !== null) {
                model.faceLabel[f] = face5.g1();
            }
        }

        const vertex1 = new Packet(meta.src);
        vertex1.pos = meta.faceIndexOffset;

        const vertex2 = new Packet(meta.src);
        vertex2.pos = meta.faceIndexOrderOffset;

        let a = 0;
        let b = 0;
        let c = 0;
        let last = 0;
        for (let f = 0; f < model.faceCount; f++) {
            const order = vertex2.g1();

            if (order === 1) {
                a = vertex1.gsmart() + last;
                b = vertex1.gsmart() + a;
                c = vertex1.gsmart() + b;
                last = c;
            } else if (order === 2) {
                // a = a;
                b = c;
                c = vertex1.gsmart() + last;
                last = c;
            } else if (order === 3) {
                a = c;
                // b = b;
                c = vertex1.gsmart() + last;
                last = c;
            } else if (order === 4) {
                const tmp = a;
                a = b;
                b = tmp;
                c = vertex1.gsmart() + last;
                last = c;
            }

            model.faceVertexA[f] = a;
            model.faceVertexB[f] = b;
            model.faceVertexC[f] = c;
        }

        const axis = new Packet(meta.src);
        axis.pos = meta.faceTextureAxisOffset;

        for (let f = 0; f < model.faceTextureCount; f++) {
            model.faceTextureP[f] = axis.g2();
            model.faceTextureM[f] = axis.g2();
            model.faceTextureN[f] = axis.g2();
        }

        return model;
    }

    static requestDownload(id: number): boolean {
        const meta = Model.meta[id];
        if (!meta) {
            Model.provider.requestModel(id);
            return false;
        }

        return true;
    }

    static combineForAnim(models: (Model | null)[], count: number): Model {
        const combined = new Model();
        Model.loaded++;

        let copyRenderType: boolean = false;
        let copyPriority: boolean = false;
        let copyAlpha: boolean = false;
        let copyLabels: boolean = false;

        combined.vertexCount = 0;
        combined.faceCount = 0;
        combined.faceTextureCount = 0;
        combined.priority = -1;

        for (let i: number = 0; i < count; i++) {
            const model: Model | null = models[i];
            if (model !== null) {
                combined.vertexCount += model.vertexCount;
                combined.faceCount += model.faceCount;
                combined.faceTextureCount += model.faceTextureCount;

                if (model.faceRenderType !== null) {
                    copyRenderType = true;
                }

                if (model.facePriority === null) {
                    if (combined.priority === -1) {
                        combined.priority = model.priority;
                    }

                    if (combined.priority !== model.priority) {
                        copyPriority = true;
                    }
                } else {
                    copyPriority = true;
                }

                if (model.faceAlpha !== null) {
                    copyAlpha = true;
                }

                if (model.faceLabel !== null) {
                    copyLabels = true;
                }
            }
        }

        combined.vertexX = new Int32Array(combined.vertexCount);
        combined.vertexY = new Int32Array(combined.vertexCount);
        combined.vertexZ = new Int32Array(combined.vertexCount);

        combined.vertexLabel = new Int32Array(combined.vertexCount);

        combined.faceVertexA = new Int32Array(combined.faceCount);
        combined.faceVertexB = new Int32Array(combined.faceCount);
        combined.faceVertexC = new Int32Array(combined.faceCount);

        combined.faceTextureP = new Int32Array(combined.faceTextureCount);
        combined.faceTextureM = new Int32Array(combined.faceTextureCount);
        combined.faceTextureN = new Int32Array(combined.faceTextureCount);

        if (copyRenderType) {
            combined.faceRenderType = new Int32Array(combined.faceCount);
        }

        if (copyPriority) {
            combined.facePriority = new Int32Array(combined.faceCount);
        }

        if (copyAlpha) {
            combined.faceAlpha = new Int32Array(combined.faceCount);
        }

        if (copyLabels) {
            combined.faceLabel = new Int32Array(combined.faceCount);
        }

        combined.faceColour = new Int32Array(combined.faceCount);

        combined.vertexCount = 0;
        combined.faceCount = 0;
        combined.faceTextureCount = 0;

        for (let i: number = 0; i < count; i++) {
            const model: Model | null = models[i];

            if (model !== null) {
                for (let f: number = 0; f < model.faceCount; f++) {
                    if (copyRenderType) {
                        if (model.faceRenderType === null) {
                            if (combined.faceRenderType) {
                                combined.faceRenderType[combined.faceCount] = 0;
                            }
                        } else {
                            if (combined.faceRenderType) {
                                combined.faceRenderType[combined.faceCount] = model.faceRenderType[f];
                            }
                        }
                    }

                    if (copyPriority) {
                        if (model.facePriority === null) {
                            if (combined.facePriority) {
                                combined.facePriority[combined.faceCount] = model.priority;
                            }
                        } else {
                            if (combined.facePriority) {
                                combined.facePriority[combined.faceCount] = model.facePriority[f];
                            }
                        }
                    }

                    if (copyAlpha) {
                        if (model.faceAlpha === null) {
                            if (combined.faceAlpha) {
                                combined.faceAlpha[combined.faceCount] = 0;
                            }
                        } else {
                            if (combined.faceAlpha) {
                                combined.faceAlpha[combined.faceCount] = model.faceAlpha[f];
                            }
                        }
                    }

                    if (copyLabels && model.faceLabel !== null) {
                        combined.faceLabel![combined.faceCount] = model.faceLabel[f];
                    }

                    combined.faceColour[combined.faceCount] = model.faceColour![f];
                    combined.faceVertexA[combined.faceCount] = combined.addPoint(model, model.faceVertexA![f]);
                    combined.faceVertexB[combined.faceCount] = combined.addPoint(model, model.faceVertexB![f]);
                    combined.faceVertexC[combined.faceCount] = combined.addPoint(model, model.faceVertexC![f]);
                    combined.faceCount++;
                }

                for (let f: number = 0; f < model.faceTextureCount; f++) {
                    combined.faceTextureP[combined.faceTextureCount] = combined.addPoint(model, model.faceTextureP![f]);
                    combined.faceTextureM[combined.faceTextureCount] = combined.addPoint(model, model.faceTextureM![f]);
                    combined.faceTextureN[combined.faceTextureCount] = combined.addPoint(model, model.faceTextureN![f]);
                    combined.faceTextureCount++;
                }
            }
        }

        return combined;
    }

    static combine(models: Model[], count: number): Model {
        const combined = new Model();
        Model.loaded++;

        let copyRenderType: boolean = false;
        let copyPriority: boolean = false;
        let copyAlpha: boolean = false;
        let copyColour: boolean = false;

        combined.vertexCount = 0;
        combined.faceCount = 0;
        combined.faceTextureCount = 0;
        combined.priority = -1;

        for (let i: number = 0; i < count; i++) {
            const model: Model = models[i];

            if (model !== null) {
                combined.vertexCount += model.vertexCount;
                combined.faceCount += model.faceCount;
                combined.faceTextureCount += model.faceTextureCount;

                if (model.faceRenderType !== null) {
                    copyRenderType = true;
                }

                if (model.facePriority === null) {
                    if (combined.priority === -1) {
                        combined.priority = model.priority;
                    }

                    if (combined.priority !== model.priority) {
                        copyPriority = true;
                    }
                } else {
                    copyPriority = true;
                }

                if (model.faceAlpha !== null) {
                    copyAlpha = true;
                }

                if (model.faceColour !== null) {
                    copyColour = true;
                }
            }
        }

        combined.vertexX = new Int32Array(combined.vertexCount);
        combined.vertexY = new Int32Array(combined.vertexCount);
        combined.vertexZ = new Int32Array(combined.vertexCount);

        combined.faceVertexA = new Int32Array(combined.faceCount);
        combined.faceVertexB = new Int32Array(combined.faceCount);
        combined.faceVertexC = new Int32Array(combined.faceCount);

        combined.faceColourA = new Int32Array(combined.faceCount);
        combined.faceColourB = new Int32Array(combined.faceCount);
        combined.faceColourC = new Int32Array(combined.faceCount);

        combined.faceTextureP = new Int32Array(combined.faceTextureCount);
        combined.faceTextureM = new Int32Array(combined.faceTextureCount);
        combined.faceTextureN = new Int32Array(combined.faceTextureCount);

        if (copyRenderType) {
            combined.faceRenderType = new Int32Array(combined.faceCount);
        }

        if (copyPriority) {
            combined.facePriority = new Int32Array(combined.faceCount);
        }

        if (copyAlpha) {
            combined.faceAlpha = new Int32Array(combined.faceCount);
        }

        if (copyColour) {
            combined.faceColour = new Int32Array(combined.faceCount);
        }

        combined.vertexCount = 0;
        combined.faceCount = 0;
        combined.faceTextureCount = 0;

        for (let i: number = 0; i < count; i++) {
            const model: Model = models[i];

            if (model !== null) {
                const vertexCount: number = combined.vertexCount;

                for (let v: number = 0; v < model.vertexCount; v++) {
                    combined.vertexX[combined.vertexCount] = model.vertexX![v];
                    combined.vertexY[combined.vertexCount] = model.vertexY![v];
                    combined.vertexZ[combined.vertexCount] = model.vertexZ![v];
                    combined.vertexCount++;
                }

                for (let f: number = 0; f < model.faceCount; f++) {
                    combined.faceVertexA[combined.faceCount] = model.faceVertexA![f] + vertexCount;
                    combined.faceVertexB[combined.faceCount] = model.faceVertexB![f] + vertexCount;
                    combined.faceVertexC[combined.faceCount] = model.faceVertexC![f] + vertexCount;

                    combined.faceColourA[combined.faceCount] = model.faceColourA![f];
                    combined.faceColourB[combined.faceCount] = model.faceColourB![f];
                    combined.faceColourC[combined.faceCount] = model.faceColourC![f];

                    if (copyRenderType) {
                        if (model.faceRenderType === null) {
                            if (combined.faceRenderType) {
                                combined.faceRenderType[combined.faceCount] = 0;
                            }
                        } else {
                            if (combined.faceRenderType) {
                                combined.faceRenderType[combined.faceCount] = model.faceRenderType[f];
                            }
                        }
                    }

                    if (copyPriority) {
                        if (model.facePriority === null) {
                            if (combined.facePriority) {
                                combined.facePriority[combined.faceCount] = model.priority;
                            }
                        } else {
                            if (combined.facePriority) {
                                combined.facePriority[combined.faceCount] = model.facePriority[f];
                            }
                        }
                    }

                    if (copyAlpha) {
                        if (model.faceAlpha === null) {
                            if (combined.faceAlpha) {
                                combined.faceAlpha[combined.faceCount] = 0;
                            }
                        } else {
                            combined.faceAlpha![combined.faceCount] = model.faceAlpha[f];
                        }
                    }

                    if (copyColour && model.faceColour !== null) {
                        combined.faceColour![combined.faceCount] = model.faceColour[f];
                    }

                    combined.faceCount++;
                }

                for (let f: number = 0; f < model.faceTextureCount; f++) {
                    combined.faceTextureP[combined.faceTextureCount] = model.faceTextureP![f] + vertexCount;
                    combined.faceTextureM[combined.faceTextureCount] = model.faceTextureM![f] + vertexCount;
                    combined.faceTextureN[combined.faceTextureCount] = model.faceTextureN![f] + vertexCount;
                    combined.faceTextureCount++;
                }
            }
        }

        combined.calcBoundingCylinder();
        return combined;
    }

    static copyForAnim(src: Model, shareColours: boolean, shareAlpha: boolean, shareVertices: boolean): Model {
        const model = new Model();
        Model.loaded++;

        model.vertexCount = src.vertexCount;
        model.faceCount = src.faceCount;
        model.faceTextureCount = src.faceTextureCount;

        if (shareVertices) {
            model.vertexX = src.vertexX;
            model.vertexY = src.vertexY;
            model.vertexZ = src.vertexZ;
        } else {
            model.vertexX = new Int32Array(model.vertexCount);
            model.vertexY = new Int32Array(model.vertexCount);
            model.vertexZ = new Int32Array(model.vertexCount);

            for (let v: number = 0; v < model.vertexCount; v++) {
                model.vertexX[v] = src.vertexX![v];
                model.vertexY[v] = src.vertexY![v];
                model.vertexZ[v] = src.vertexZ![v];
            }
        }

        if (shareColours) {
            model.faceColour = src.faceColour;
        } else {
            model.faceColour = new Int32Array(model.faceCount);

            for (let f: number = 0; f < model.faceCount; f++) {
                model.faceColour[f] = src.faceColour![f];
            }
        }

        if (shareAlpha) {
            model.faceAlpha = src.faceAlpha;
        } else {
            model.faceAlpha = new Int32Array(model.faceCount);

            if (src.faceAlpha === null) {
                for (let f: number = 0; f < model.faceCount; f++) {
                    model.faceAlpha[f] = 0;
                }
            } else {
                for (let f: number = 0; f < model.faceCount; f++) {
                    model.faceAlpha[f] = src.faceAlpha[f];
                }
            }
        }

        model.vertexLabel = src.vertexLabel;
        model.faceLabel = src.faceLabel;

        model.faceRenderType = src.faceRenderType;

        model.faceVertexA = src.faceVertexA;
        model.faceVertexB = src.faceVertexB;
        model.faceVertexC = src.faceVertexC;

        model.facePriority = src.facePriority;
        model.priority = src.priority;

        model.faceTextureP = src.faceTextureP;
        model.faceTextureM = src.faceTextureM;
        model.faceTextureN = src.faceTextureN;

        return model;
    }

    static hillSkewCopy(src: Model, copyVertexY: boolean, copyFaces: boolean): Model {
        const model = new Model();
        Model.loaded++;

        model.vertexCount = src.vertexCount;
        model.faceCount = src.faceCount;
        model.faceTextureCount = src.faceTextureCount;

        if (copyVertexY) {
            model.vertexY = new Int32Array(model.vertexCount);

            for (let v: number = 0; v < model.vertexCount; v++) {
                model.vertexY[v] = src.vertexY![v];
            }
        } else {
            model.vertexY = src.vertexY;
        }

        if (copyFaces) {
            model.faceColourA = new Int32Array(model.faceCount);
            model.faceColourB = new Int32Array(model.faceCount);
            model.faceColourC = new Int32Array(model.faceCount);

            for (let f: number = 0; f < model.faceCount; f++) {
                model.faceColourA[f] = src.faceColourA![f];
                model.faceColourB[f] = src.faceColourB![f];
                model.faceColourC[f] = src.faceColourC![f];
            }

            model.faceRenderType = new Int32Array(model.faceCount);
            if (src.faceRenderType === null) {
                for (let f: number = 0; f < model.faceCount; f++) {
                    model.faceRenderType[f] = 0;
                }
            } else {
                for (let f: number = 0; f < model.faceCount; f++) {
                    model.faceRenderType[f] = src.faceRenderType[f];
                }
            }

            model.vertexNormal = new TypedArray1d(model.vertexCount, null);
            for (let v: number = 0; v < model.vertexCount; v++) {
                const normal: PointNormal = (model.vertexNormal[v] = new PointNormal());
                const original: PointNormal = src.vertexNormal![v]!;
                normal.x = original.x;
                normal.y = original.y;
                normal.z = original.z;
                normal.w = original.w;
            }

            model.vertexNormalOriginal = src.vertexNormalOriginal;
        } else {
            model.faceColourA = src.faceColourA;
            model.faceColourB = src.faceColourB;
            model.faceColourC = src.faceColourC;
            model.faceRenderType = src.faceRenderType;
        }

        model.vertexX = src.vertexX;
        model.vertexZ = src.vertexZ;

        model.faceColour = src.faceColour;
        model.faceAlpha = src.faceAlpha;
        model.facePriority = src.facePriority;
        model.priority = src.priority;

        model.faceVertexA = src.faceVertexA;
        model.faceVertexB = src.faceVertexB;
        model.faceVertexC = src.faceVertexC;

        model.faceTextureP = src.faceTextureP;
        model.faceTextureM = src.faceTextureM;
        model.faceTextureN = src.faceTextureN;

        model.minY = src.minY;
        model.maxY = src.maxY;
        model.radius = src.radius;
        model.minDepth = src.minDepth;
        model.maxDepth = src.maxDepth;
        model.minX = src.minX;
        model.maxZ = src.maxZ;
        model.minZ = src.minZ;
        model.maxX = src.maxX;

        return model;
    }

    set(src: Model, shareAlpha: boolean): void {
        this.vertexCount = src.vertexCount;
        this.faceCount = src.faceCount;
        this.faceTextureCount = src.faceTextureCount;

        if (Model.tmpVertexX.length < this.vertexCount) {
            Model.tmpVertexX = new Int32Array(this.vertexCount + 100);
            Model.tmpVertexY = new Int32Array(this.vertexCount + 100);
            Model.tmpVertexZ = new Int32Array(this.vertexCount + 100);
        }

        this.vertexX = Model.tmpVertexX;
        this.vertexY = Model.tmpVertexY;
        this.vertexZ = Model.tmpVertexZ;

        for (let v: number = 0; v < this.vertexCount; v++) {
            this.vertexX[v] = src.vertexX![v];
            this.vertexY[v] = src.vertexY![v];
            this.vertexZ[v] = src.vertexZ![v];
        }

        if (shareAlpha) {
            this.faceAlpha = src.faceAlpha;
        } else {
            if (Model.tempFTran.length < this.faceCount) {
                Model.tempFTran = new Int32Array(this.faceCount + 100);
            }

            this.faceAlpha = Model.tempFTran;

            if (!src.faceAlpha) {
                for (let f: number = 0; f < this.faceCount; f++) {
                    this.faceAlpha[f] = 0;
                }
            } else {
                for (let f: number = 0; f < this.faceCount; f++) {
                    this.faceAlpha[f] = src.faceAlpha[f];
                }
            }
        }

        this.faceRenderType = src.faceRenderType;
        this.faceColour = src.faceColour;
        this.facePriority = src.facePriority;
        this.priority = src.priority;

        this.labelFaces = src.labelFaces;
        this.labelVertices = src.labelVertices;

        this.faceVertexA = src.faceVertexA;
        this.faceVertexB = src.faceVertexB;
        this.faceVertexC = src.faceVertexC;

        this.faceColourA = src.faceColourA;
        this.faceColourB = src.faceColourB;
        this.faceColourC = src.faceColourC;

        this.faceTextureP = src.faceTextureP;
        this.faceTextureM = src.faceTextureM;
        this.faceTextureN = src.faceTextureN;
    }

    addPoint(src: Model, vertex: number) {
        let index = -1;

        const x = src.vertexX![vertex];
        const y = src.vertexY![vertex];
        const z = src.vertexZ![vertex];

        for (let v = 0; v < this.vertexCount; v++) {
            if (this.vertexX![v] === x && this.vertexY![v] === y && this.vertexZ![v] === z) {
                index = v;
                break;
            }
        }

        if (index === -1) {
            this.vertexX![this.vertexCount] = x;
            this.vertexY![this.vertexCount] = y;
            this.vertexZ![this.vertexCount] = z;

            if (src.vertexLabel !== null) {
                this.vertexLabel![this.vertexCount] = src.vertexLabel[vertex];
            }

            index = this.vertexCount++;
        }

        return index;
    }

    calcBoundingCylinder(): void {
        this.minY = 0;
        this.radius = 0;
        this.maxY = 0;

        for (let i: number = 0; i < this.vertexCount; i++) {
            const x: number = this.vertexX![i];
            const y: number = this.vertexY![i];
            const z: number = this.vertexZ![i];

            if (-y > this.minY) {
                this.minY = -y;
            }

            if (y > this.maxY) {
                this.maxY = y;
            }

            const radiusSqr: number = x * x + z * z;
            if (radiusSqr > this.radius) {
                this.radius = radiusSqr;
            }
        }

        this.radius = (Math.sqrt(this.radius) + 0.99) | 0;
        this.minDepth = (Math.sqrt(this.radius * this.radius + this.minY * this.minY) + 0.99) | 0;
        this.maxDepth = this.minDepth + ((Math.sqrt(this.radius * this.radius + this.maxY * this.maxY) + 0.99) | 0);
    }

    recalcBoundingCylinder(): void {
        this.minY = 0;
        this.maxY = 0;

        for (let i: number = 0; i < this.vertexCount; i++) {
            const y: number = this.vertexY![i];

            if (-y > this.minY) {
                this.minY = -y;
            }

            if (y > this.maxY) {
                this.maxY = y;
            }
        }

        this.minDepth = (Math.sqrt(this.radius * this.radius + this.minY * this.minY) + 0.99) | 0;
        this.maxDepth = this.minDepth + ((Math.sqrt(this.radius * this.radius + this.maxY * this.maxY) + 0.99) | 0);
    }

    private calcBoundingCube(): void {
        this.minY = 0;
        this.radius = 0;
        this.maxY = 0;
        this.minX = 999999;
        this.maxX = -999999;
        this.maxZ = -99999;
        this.minZ = 99999;

        for (let v: number = 0; v < this.vertexCount; v++) {
            const x: number = this.vertexX![v];
            const y: number = this.vertexY![v];
            const z: number = this.vertexZ![v];

            if (x < this.minX) {
                this.minX = x;
            }

            if (x > this.maxX) {
                this.maxX = x;
            }

            if (z < this.minZ) {
                this.minZ = z;
            }

            if (z > this.maxZ) {
                this.maxZ = z;
            }

            if (-y > this.minY) {
                this.minY = -y;
            }

            if (y > this.maxY) {
                this.maxY = y;
            }

            const radiusSqr: number = x * x + z * z;
            if (radiusSqr > this.radius) {
                this.radius = radiusSqr;
            }
        }

        this.radius = Math.sqrt(this.radius) | 0;
        this.minDepth = Math.sqrt(this.radius * this.radius + this.minY * this.minY) | 0;
        this.maxDepth = this.minDepth + (Math.sqrt(this.radius * this.radius + this.maxY * this.maxY) | 0);
    }

    prepareAnim(): void {
        if (this.vertexLabel) {
            const labelVertexCount: Int32Array = new Int32Array(256);
            let count: number = 0;

            for (let v: number = 0; v < this.vertexCount; v++) {
                const label: number = this.vertexLabel[v];
                labelVertexCount[label]++;
                if (label > count) {
                    count = label;
                }
            }

            this.labelVertices = new TypedArray1d(count + 1, null);
            for (let label: number = 0; label <= count; label++) {
                this.labelVertices[label] = new Int32Array(labelVertexCount[label]);
                labelVertexCount[label] = 0;
            }

            let v: number = 0;
            while (v < this.vertexCount) {
                const label: number = this.vertexLabel[v];
                const verts: Int32Array | null = this.labelVertices[label];
                if (!verts) {
                    continue;
                }

                verts[labelVertexCount[label]++] = v++;
            }

            this.vertexLabel = null;
        }

        if (this.faceLabel) {
            const labelFaceCount: Int32Array = new Int32Array(256);
            let count: number = 0;
            for (let f: number = 0; f < this.faceCount; f++) {
                const label: number = this.faceLabel[f];
                labelFaceCount[label]++;
                if (label > count) {
                    count = label;
                }
            }

            this.labelFaces = new TypedArray1d(count + 1, null);
            for (let label: number = 0; label <= count; label++) {
                this.labelFaces[label] = new Int32Array(labelFaceCount[label]);
                labelFaceCount[label] = 0;
            }

            let face: number = 0;
            while (face < this.faceCount) {
                const label: number = this.faceLabel[face];
                const faces: Int32Array | null = this.labelFaces[label];
                if (!faces) {
                    continue;
                }

                faces[labelFaceCount[label]++] = face++;
            }

            this.faceLabel = null;
        }
    }

    animate(id: number): void {
        if (!this.labelVertices || id === -1) {
            return;
        }

        const transform: AnimFrame = AnimFrame.list[id];
        if (!transform) {
            return;
        }

        const skeleton: AnimBase | null = transform.base;
        Model.oX = 0;
        Model.oY = 0;
        Model.oZ = 0;

        for (let i: number = 0; i < transform.size; i++) {
            if (!transform.ti || !transform.tx || !transform.ty || !transform.tz || !skeleton || !skeleton.labels || !skeleton.type) {
                continue;
            }

            const base: number = transform.ti[i];
            this.animate2(transform.tx[i], transform.ty[i], transform.tz[i], skeleton.labels[base], skeleton.type[base]);
        }
    }

    animateTween(id: number, nextId: number, alpha: number): void {
        if (!this.labelVertices || id === -1) {
            return;
        }

        if (nextId === -1 || alpha <= 0 || id === nextId) {
            this.animate(id);
            return;
        }

        if (alpha >= 1) {
            this.animate(nextId);
            return;
        }

        const current: AnimFrame = AnimFrame.get(id);
        const next: AnimFrame = AnimFrame.get(nextId);
        if (!current || !next || current.base !== next.base || !current.base || !current.base.labels || !current.base.type || !current.ti || !next.ti) {
            this.animate(id);
            return;
        }

        const skeleton: AnimBase = current.base;
        Model.oX = 0;
        Model.oY = 0;
        Model.oZ = 0;

        const curIndex = new Map<number, number>();
        const nextIndex = new Map<number, number>();
        for (let i = 0; i < current.size; i++) {
            curIndex.set(current.ti[i], i);
        }
        for (let i = 0; i < next.size; i++) {
            nextIndex.set(next.ti[i], i);
        }

        for (let base = 0; base < skeleton.size; base++) {
            const ci = curIndex.get(base);
            const ni = nextIndex.get(base);
            if (ci === undefined && ni === undefined) {
                continue;
            }

            const type = skeleton.type[base];
            const defaultValue = type === AnimTransform.SCALE ? 128 : 0;

            const cx = ci === undefined || !current.tx ? defaultValue : current.tx[ci];
            const cy = ci === undefined || !current.ty ? defaultValue : current.ty[ci];
            const cz = ci === undefined || !current.tz ? defaultValue : current.tz[ci];

            const nx = ni === undefined || !next.tx ? defaultValue : next.tx[ni];
            const ny = ni === undefined || !next.ty ? defaultValue : next.ty[ni];
            const nz = ni === undefined || !next.tz ? defaultValue : next.tz[ni];

            const x = (cx + (nx - cx) * alpha) | 0;
            const y = (cy + (ny - cy) * alpha) | 0;
            const z = (cz + (nz - cz) * alpha) | 0;

            this.animate2(x, y, z, skeleton.labels[base], type);
        }
    }

    maskAnimate(primaryId: number, secondaryId: number, mask: Int32Array | null): void {
        if (primaryId === -1) {
            return;
        }

        if (!mask || secondaryId === -1) {
            this.animate(primaryId);
            return;
        }

        const primary: AnimFrame = AnimFrame.get(primaryId);
        if (!primary) {
            return;
        }

        const secondary: AnimFrame = AnimFrame.get(secondaryId);
        if (!secondary) {
            this.animate(primaryId);
            return;
        }

        const skeleton: AnimBase | null = primary.base;

        Model.oX = 0;
        Model.oY = 0;
        Model.oZ = 0;

        let counter: number = 0;
        let maskBase: number = mask[counter++];

        for (let i: number = 0; i < primary.size; i++) {
            if (!primary.ti) {
                continue;
            }

            const base: number = primary.ti[i];
            while (base > maskBase) {
                maskBase = mask[counter++];
            }

            if (skeleton && skeleton.type && primary.tx && primary.ty && primary.tz && skeleton.labels && (base !== maskBase || skeleton.type[base] === 0)) {
                this.animate2(primary.tx[i], primary.ty[i], primary.tz[i], skeleton.labels[base], skeleton.type[base]);
            }
        }

        Model.oX = 0;
        Model.oY = 0;
        Model.oZ = 0;

        counter = 0;
        maskBase = mask[counter++];

        for (let i: number = 0; i < secondary.size; i++) {
            if (!secondary.ti) {
                continue;
            }

            const base: number = secondary.ti[i];
            while (base > maskBase) {
                maskBase = mask[counter++];
            }

            if (skeleton && skeleton.type && secondary.tx && secondary.ty && secondary.tz && skeleton.labels && (base === maskBase || skeleton.type[base] === 0)) {
                this.animate2(secondary.tx[i], secondary.ty[i], secondary.tz[i], skeleton.labels[base], skeleton.type[base]);
            }
        }
    }

    private animate2(x: number, y: number, z: number, labels: Uint8Array | null, type: number): void {
        if (!labels) {
            return;
        }

        const labelCount: number = labels.length;

        if (type === AnimTransform.ORIGIN) {
            let count: number = 0;
            Model.oX = 0;
            Model.oY = 0;
            Model.oZ = 0;

            for (let g: number = 0; g < labelCount; g++) {
                if (!this.labelVertices) {
                    continue;
                }
                const label: number = labels[g];
                if (label < this.labelVertices.length) {
                    const vertices: Int32Array | null = this.labelVertices[label];
                    if (vertices) {
                        for (let i: number = 0; i < vertices.length; i++) {
                            const v: number = vertices[i];
                            Model.oX += this.vertexX![v];
                            Model.oY += this.vertexY![v];
                            Model.oZ += this.vertexZ![v];
                            count++;
                        }
                    }
                }
            }

            if (count > 0) {
                Model.oX = ((Model.oX / count) | 0) + x;
                Model.oY = ((Model.oY / count) | 0) + y;
                Model.oZ = ((Model.oZ / count) | 0) + z;
            } else {
                Model.oX = x;
                Model.oY = y;
                Model.oZ = z;
            }
        } else if (type === AnimTransform.TRANSLATE) {
            for (let g: number = 0; g < labelCount; g++) {
                const group: number = labels[g];
                if (!this.labelVertices || group >= this.labelVertices.length) {
                    continue;
                }

                const vertices: Int32Array | null = this.labelVertices[group];
                if (vertices) {
                    for (let i: number = 0; i < vertices.length; i++) {
                        const v: number = vertices[i];
                        this.vertexX![v] += x;
                        this.vertexY![v] += y;
                        this.vertexZ![v] += z;
                    }
                }
            }
        } else if (type === AnimTransform.ROTATE) {
            for (let g: number = 0; g < labelCount; g++) {
                const label: number = labels[g];
                if (!this.labelVertices || label >= this.labelVertices.length) {
                    continue;
                }

                const vertices: Int32Array | null = this.labelVertices[label];
                if (vertices) {
                    for (let i: number = 0; i < vertices.length; i++) {
                        const v: number = vertices[i];
                        this.vertexX![v] -= Model.oX;
                        this.vertexY![v] -= Model.oY;
                        this.vertexZ![v] -= Model.oZ;

                        const pitch: number = (x & 0xff) * 8;
                        const yaw: number = (y & 0xff) * 8;
                        const roll: number = (z & 0xff) * 8;

                        let sin: number;
                        let cos: number;

                        if (roll !== 0) {
                            sin = Pix3D.sinTable[roll];
                            cos = Pix3D.cosTable[roll];
                            const x_: number = (this.vertexY![v] * sin + this.vertexX![v] * cos) >> 16;
                            this.vertexY![v] = (this.vertexY![v] * cos - this.vertexX![v] * sin) >> 16;
                            this.vertexX![v] = x_;
                        }

                        if (pitch !== 0) {
                            sin = Pix3D.sinTable[pitch];
                            cos = Pix3D.cosTable[pitch];
                            const y_: number = (this.vertexY![v] * cos - this.vertexZ![v] * sin) >> 16;
                            this.vertexZ![v] = (this.vertexY![v] * sin + this.vertexZ![v] * cos) >> 16;
                            this.vertexY![v] = y_;
                        }

                        if (yaw !== 0) {
                            sin = Pix3D.sinTable[yaw];
                            cos = Pix3D.cosTable[yaw];
                            const x_: number = (this.vertexZ![v] * sin + this.vertexX![v] * cos) >> 16;
                            this.vertexZ![v] = (this.vertexZ![v] * cos - this.vertexX![v] * sin) >> 16;
                            this.vertexX![v] = x_;
                        }

                        this.vertexX![v] += Model.oX;
                        this.vertexY![v] += Model.oY;
                        this.vertexZ![v] += Model.oZ;
                    }
                }
            }
        } else if (type === AnimTransform.SCALE) {
            for (let g: number = 0; g < labelCount; g++) {
                const label: number = labels[g];
                if (!this.labelVertices || label >= this.labelVertices.length) {
                    continue;
                }

                const vertices: Int32Array | null = this.labelVertices[label];
                if (vertices) {
                    for (let i: number = 0; i < vertices.length; i++) {
                        const v: number = vertices[i];

                        this.vertexX![v] -= Model.oX;
                        this.vertexY![v] -= Model.oY;
                        this.vertexZ![v] -= Model.oZ;

                        this.vertexX![v] = ((this.vertexX![v] * x) / 128) | 0;
                        this.vertexY![v] = ((this.vertexY![v] * y) / 128) | 0;
                        this.vertexZ![v] = ((this.vertexZ![v] * z) / 128) | 0;

                        this.vertexX![v] += Model.oX;
                        this.vertexY![v] += Model.oY;
                        this.vertexZ![v] += Model.oZ;
                    }
                }
            }
        } else if (type === AnimTransform.TRANSPARENCY && this.labelFaces && this.faceAlpha) {
            for (let g: number = 0; g < labelCount; g++) {
                const label: number = labels[g];
                if (label >= this.labelFaces.length) {
                    continue;
                }

                const triangles: Int32Array | null = this.labelFaces[label];
                if (triangles) {
                    for (let i: number = 0; i < triangles.length; i++) {
                        const t: number = triangles[i];

                        this.faceAlpha[t] += x * 8;
                        if (this.faceAlpha[t] < 0) {
                            this.faceAlpha[t] = 0;
                        }

                        if (this.faceAlpha[t] > 255) {
                            this.faceAlpha[t] = 255;
                        }
                    }
                }
            }
        }
    }

    rotate90(): void {
        for (let v: number = 0; v < this.vertexCount; v++) {
            const tmp: number = this.vertexX![v];
            this.vertexX![v] = this.vertexZ![v];
            this.vertexZ![v] = -tmp;
        }
    }

    rotateXAxis(angle: number): void {
        const sin: number = Pix3D.sinTable[angle];
        const cos: number = Pix3D.cosTable[angle];

        for (let v: number = 0; v < this.vertexCount; v++) {
            const tmp: number = (this.vertexY![v] * cos - this.vertexZ![v] * sin) >> 16;
            this.vertexZ![v] = (this.vertexY![v] * sin + this.vertexZ![v] * cos) >> 16;
            this.vertexY![v] = tmp;
        }
    }

    translate(y: number, x: number, z: number): void {
        for (let v: number = 0; v < this.vertexCount; v++) {
            this.vertexX![v] += x;
            this.vertexY![v] += y;
            this.vertexZ![v] += z;
        }
    }

    recolour(src: number, dst: number): void {
        if (!this.faceColour) {
            return;
        }

        for (let f: number = 0; f < this.faceCount; f++) {
            if (this.faceColour[f] === src) {
                this.faceColour[f] = dst;
            }
        }
    }

    mirror(): void {
        for (let v: number = 0; v < this.vertexCount; v++) {
            this.vertexZ![v] = -this.vertexZ![v];
        }

        for (let f: number = 0; f < this.faceCount; f++) {
            const tmp: number = this.faceVertexA![f];
            this.faceVertexA![f] = this.faceVertexC![f];
            this.faceVertexC![f] = tmp;
        }
    }

    resize(x: number, y: number, z: number): void {
        for (let v: number = 0; v < this.vertexCount; v++) {
            this.vertexX![v] = ((this.vertexX![v] * x) / 128) | 0;
            this.vertexY![v] = ((this.vertexY![v] * y) / 128) | 0;
            this.vertexZ![v] = ((this.vertexZ![v] * z) / 128) | 0;
        }
    }

    calculateNormals(ambient: number, contrast: number, x: number, y: number, z: number, doNotShareLight: boolean): void {
        const lightMagnitude: number = Math.sqrt(x * x + y * y + z * z) | 0;
        const scale: number = (contrast * lightMagnitude) >> 8;

        if (!this.faceColourA || !this.faceColourB || !this.faceColourC) {
            this.faceColourA = new Int32Array(this.faceCount);
            this.faceColourB = new Int32Array(this.faceCount);
            this.faceColourC = new Int32Array(this.faceCount);
        }

        if (!this.vertexNormal) {
            this.vertexNormal = new TypedArray1d(this.vertexCount, null);

            for (let v: number = 0; v < this.vertexCount; v++) {
                this.vertexNormal[v] = new PointNormal();
            }
        }

        for (let f: number = 0; f < this.faceCount; f++) {
            const a: number = this.faceVertexA![f];
            const b: number = this.faceVertexB![f];
            const c: number = this.faceVertexC![f];

            const dxAB: number = this.vertexX![b] - this.vertexX![a];
            const dyAB: number = this.vertexY![b] - this.vertexY![a];
            const dzAB: number = this.vertexZ![b] - this.vertexZ![a];

            const dxAC: number = this.vertexX![c] - this.vertexX![a];
            const dyAC: number = this.vertexY![c] - this.vertexY![a];
            const dzAC: number = this.vertexZ![c] - this.vertexZ![a];

            let nx: number = dyAB * dzAC - dyAC * dzAB;
            let ny: number = dzAB * dxAC - dzAC * dxAB;
            let nz: number = dxAB * dyAC - dxAC * dyAB;

            while (nx > 8192 || ny > 8192 || nz > 8192 || nx < -8192 || ny < -8192 || nz < -8192) {
                nx >>= 1;
                ny >>= 1;
                nz >>= 1;
            }

            let length: number = Math.sqrt(nx * nx + ny * ny + nz * nz) | 0;
            if (length <= 0) {
                length = 1;
            }

            nx = ((nx * 256) / length) | 0;
            ny = ((ny * 256) / length) | 0;
            nz = ((nz * 256) / length) | 0;

            if (!this.faceRenderType || (this.faceRenderType[f] & 0x1) === 0) {
                let n: PointNormal | null = this.vertexNormal[a];
                if (n) {
                    n.x += nx;
                    n.y += ny;
                    n.z += nz;
                    n.w++;
                }

                n = this.vertexNormal[b];
                if (n) {
                    n.x += nx;
                    n.y += ny;
                    n.z += nz;
                    n.w++;
                }

                n = this.vertexNormal[c];
                if (n) {
                    n.x += nx;
                    n.y += ny;
                    n.z += nz;
                    n.w++;
                }
            } else {
                // face normal
                const lightness: number = ambient + (((x * nx + y * ny + z * nz) / (scale + ((scale / 2) | 0))) | 0);
                if (this.faceColour) {
                    this.faceColourA[f] = Model.getColour(this.faceColour[f], lightness, this.faceRenderType[f]);
                }
            }
        }

        if (doNotShareLight) {
            this.light(ambient, scale, x, y, z);
        } else {
            this.vertexNormalOriginal = new TypedArray1d(this.vertexCount, null);

            for (let v: number = 0; v < this.vertexCount; v++) {
                const normal: PointNormal | null = this.vertexNormal[v];
                const copy: PointNormal = new PointNormal();

                if (normal) {
                    copy.x = normal.x;
                    copy.y = normal.y;
                    copy.z = normal.z;
                    copy.w = normal.w;
                }

                this.vertexNormalOriginal[v] = copy;
            }
        }

        if (doNotShareLight) {
            this.calcBoundingCylinder();
        } else {
            this.calcBoundingCube();
        }
    }

    light(ambient: number, contrast: number, x: number, y: number, z: number): void {
        for (let f: number = 0; f < this.faceCount; f++) {
            const a: number = this.faceVertexA![f];
            const b: number = this.faceVertexB![f];
            const c: number = this.faceVertexC![f];

            if (!this.faceRenderType && this.faceColour && this.vertexNormal && this.faceColourA && this.faceColourB && this.faceColourC) {
                const colour: number = this.faceColour[f];

                const va: PointNormal | null = this.vertexNormal[a];
                if (va) {
                    this.faceColourA[f] = Model.getColour(colour, ambient + (((x * va.x + y * va.y + z * va.z) / (contrast * va.w)) | 0), 0);
                }

                const vb: PointNormal | null = this.vertexNormal[b];
                if (vb) {
                    this.faceColourB[f] = Model.getColour(colour, ambient + (((x * vb.x + y * vb.y + z * vb.z) / (contrast * vb.w)) | 0), 0);
                }

                const vc: PointNormal | null = this.vertexNormal[c];
                if (vc) {
                    this.faceColourC[f] = Model.getColour(colour, ambient + (((x * vc.x + y * vc.y + z * vc.z) / (contrast * vc.w)) | 0), 0);
                }
            } else if (this.faceRenderType && (this.faceRenderType[f] & 0x1) === 0 && this.faceColour && this.vertexNormal && this.faceColourA && this.faceColourB && this.faceColourC) {
                const colour: number = this.faceColour[f];
                const info: number = this.faceRenderType[f];

                const va: PointNormal | null = this.vertexNormal[a];
                if (va) {
                    this.faceColourA[f] = Model.getColour(colour, ambient + (((x * va.x + y * va.y + z * va.z) / (contrast * va.w)) | 0), info);
                }

                const vb: PointNormal | null = this.vertexNormal[b];
                if (vb) {
                    this.faceColourB[f] = Model.getColour(colour, ambient + (((x * vb.x + y * vb.y + z * vb.z) / (contrast * vb.w)) | 0), info);
                }

                const vc: PointNormal | null = this.vertexNormal[c];
                if (vc) {
                    this.faceColourC[f] = Model.getColour(colour, ambient + (((x * vc.x + y * vc.y + z * vc.z) / (contrast * vc.w)) | 0), info);
                }
            }
        }

        this.vertexNormal = null;
        this.vertexNormalOriginal = null;
        this.vertexLabel = null;
        this.faceLabel = null;

        if (this.faceRenderType) {
            for (let f: number = 0; f < this.faceCount; f++) {
                if ((this.faceRenderType[f] & 0x2) === 2) {
                    return;
                }
            }
        }

        this.faceColour = null;
    }

    static getColour(hsl: number, scalar: number, faceRenderType: number): number {
        if ((faceRenderType & 0x2) === 2) {
            // getTexLight
            if (scalar < 0) {
                scalar = 0;
            } else if (scalar > 127) {
                scalar = 127;
            }

            return 127 - scalar;
        } else {
            // getColour
            scalar = (scalar * (hsl & 0x7f)) >> 7;

            if (scalar < 2) {
                scalar = 2;
            } else if (scalar > 126) {
                scalar = 126;
            }

            return (hsl & 0xff80) + scalar;
        }
    }

    objRender(pitch: number, yaw: number, roll: number, eyePitch: number, eyeX: number, eyeY: number, eyeZ: number): void {
        const sinPitch: number = Pix3D.sinTable[pitch];
        const cosPitch: number = Pix3D.cosTable[pitch];

        const sinYaw: number = Pix3D.sinTable[yaw];
        const cosYaw: number = Pix3D.cosTable[yaw];

        const sinRoll: number = Pix3D.sinTable[roll];
        const cosRoll: number = Pix3D.cosTable[roll];

        const sinEyePitch: number = Pix3D.sinTable[eyePitch];
        const cosEyePitch: number = Pix3D.cosTable[eyePitch];

        const midZ: number = (eyeY * sinEyePitch + eyeZ * cosEyePitch) >> 16;

        for (let v: number = 0; v < this.vertexCount; v++) {
            let x: number = this.vertexX![v];
            let y: number = this.vertexY![v];
            let z: number = this.vertexZ![v];

            let tmp: number;
            if (roll !== 0) {
                tmp = (y * sinRoll + x * cosRoll) >> 16;
                y = (y * cosRoll - x * sinRoll) >> 16;
                x = tmp;
            }

            if (pitch !== 0) {
                tmp = (y * cosPitch - z * sinPitch) >> 16;
                z = (y * sinPitch + z * cosPitch) >> 16;
                y = tmp;
            }

            if (yaw !== 0) {
                tmp = (z * sinYaw + x * cosYaw) >> 16;
                z = (z * cosYaw - x * sinYaw) >> 16;
                x = tmp;
            }

            x += eyeX;
            y += eyeY;
            z += eyeZ;

            tmp = (y * cosEyePitch - z * sinEyePitch) >> 16;
            z = (y * sinEyePitch + z * cosEyePitch) >> 16;
            y = tmp;

            Model.vertexScreenZ[v] = z - midZ;
            Model.vertexScreenX[v] = Pix3D.originX + (((x << 9) / z) | 0);
            Model.vertexScreenY[v] = Pix3D.originY + (((y << 9) / z) | 0);

            if (this.faceTextureCount > 0) {
                Model.vertexViewSpaceX[v] = x;
                Model.vertexViewSpaceY[v] = y;
                Model.vertexViewSpaceZ[v] = z;
            }
        }

        try {
            // try catch for example a model being drawn from 3d can crash like at baxtorian falls
            this.render2(false, false, 0);
        } catch (_e) {
            // empty
        }
    }

    override worldRender(_loopCycle: number, yaw: number, sinEyePitch: number, cosEyePitch: number, sinEyeYaw: number, cosEyeYaw: number, relativeX: number, relativeY: number, relativeZ: number, typecode: number): void {
        const zPrime: number = (relativeZ * cosEyeYaw - relativeX * sinEyeYaw) >> 16;
        const midZ: number = (relativeY * sinEyePitch + zPrime * cosEyePitch) >> 16;
        const radiusCosEyePitch: number = (this.radius * cosEyePitch) >> 16;

        const maxZ: number = midZ + radiusCosEyePitch;
        if (maxZ <= 50 || midZ >= 3500) {
            return;
        }

        const midX: number = (relativeZ * sinEyeYaw + relativeX * cosEyeYaw) >> 16;
        let leftX: number = (midX - this.radius) << 9;
        if (((leftX / maxZ) | 0) >= Pix2D.maxX) {
            return;
        }

        let rightX: number = (midX + this.radius) << 9;
        if (((rightX / maxZ) | 0) <= -Pix2D.maxX) {
            return;
        }

        const midY: number = (relativeY * cosEyePitch - zPrime * sinEyePitch) >> 16;
        const radiusSinEyePitch: number = (this.radius * sinEyePitch) >> 16;

        let bottomY: number = (midY + radiusSinEyePitch) << 9;
        if (((bottomY / maxZ) | 0) <= -Pix2D.maxY) {
            return;
        }

        const yPrime: number = radiusSinEyePitch + ((this.minY * cosEyePitch) >> 16);
        let topY: number = (midY - yPrime) << 9;
        if (((topY / maxZ) | 0) >= Pix2D.maxY) {
            return;
        }

        const radiusZ: number = radiusCosEyePitch + ((this.minY * sinEyePitch) >> 16);

        let clipped: boolean = midZ - radiusZ <= 50;
        let picking: boolean = false;

        if (typecode > 0 && Model.mouseCheck) {
            let z: number = midZ - radiusCosEyePitch;
            if (z <= 50) {
                z = 50;
            }

            if (midX > 0) {
                leftX = (leftX / maxZ) | 0;
                rightX = (rightX / z) | 0;
            } else {
                rightX = (rightX / maxZ) | 0;
                leftX = (leftX / z) | 0;
            }

            if (midY > 0) {
                topY = (topY / maxZ) | 0;
                bottomY = (bottomY / z) | 0;
            } else {
                bottomY = (bottomY / maxZ) | 0;
                topY = (topY / z) | 0;
            }

            const mouseX: number = Model.mouseX - Pix3D.originX;
            const mouseY: number = Model.mouseY - Pix3D.originY;
            if (mouseX > leftX && mouseX < rightX && mouseY > topY && mouseY < bottomY) {
                if (this.useAABBMouseCheck) {
                    Model.pickedEntityTypecode[Model.pickedCount++] = typecode;
                } else {
                    picking = true;
                }
            }
        }

        const centerX: number = Pix3D.originX;
        const centerY: number = Pix3D.originY;

        let sinYaw: number = 0;
        let cosYaw: number = 0;
        if (yaw !== 0) {
            sinYaw = Pix3D.sinTable[yaw];
            cosYaw = Pix3D.cosTable[yaw];
        }

        for (let v: number = 0; v < this.vertexCount; v++) {
            let x: number = this.vertexX![v];
            let y: number = this.vertexY![v];
            let z: number = this.vertexZ![v];

            let temp: number;
            if (yaw !== 0) {
                temp = (z * sinYaw + x * cosYaw) >> 16;
                z = (z * cosYaw - x * sinYaw) >> 16;
                x = temp;
            }

            x += relativeX;
            y += relativeY;
            z += relativeZ;

            temp = (z * sinEyeYaw + x * cosEyeYaw) >> 16;
            z = (z * cosEyeYaw - x * sinEyeYaw) >> 16;
            x = temp;

            temp = (y * cosEyePitch - z * sinEyePitch) >> 16;
            z = (y * sinEyePitch + z * cosEyePitch) >> 16;
            y = temp;

            Model.vertexScreenZ[v] = z - midZ;

            if (z >= 50) {
                Model.vertexScreenX[v] = centerX + (((x << 9) / z) | 0);
                Model.vertexScreenY[v] = centerY + (((y << 9) / z) | 0);
            } else {
                Model.vertexScreenX[v] = -5000;
                clipped = true;
            }

            if (clipped || this.faceTextureCount > 0) {
                Model.vertexViewSpaceX[v] = x;
                Model.vertexViewSpaceY[v] = y;
                Model.vertexViewSpaceZ[v] = z;
            }
        }

        HDRenderer.queueModel(this, yaw, relativeX, relativeY, relativeZ);

        try {
            // try catch for example a model being drawn from 3d can crash like at baxtorian falls
            this.render2(clipped, picking, typecode);
        } catch (_e) {
            // empty
        }
    }

    queueHdModel(yaw: number, relativeX: number, relativeY: number, relativeZ: number): void {
        HDRenderer.queueModel(this, yaw, relativeX, relativeY, relativeZ);
    }

    override hdRender(_loopCycle: number, yaw: number, relativeX: number, relativeY: number, relativeZ: number): void {
        this.queueHdModel(yaw, relativeX, relativeY, relativeZ);
    }

    private render2(clipped: boolean, picking: boolean, typecode: number): void {
        for (let depth: number = 0; depth < this.maxDepth; depth++) {
            Model.tmpDepthFaceCount[depth] = 0;
        }

        for (let f: number = 0; f < this.faceCount; f++) {
            if (this.faceRenderType && this.faceRenderType[f] === -1) {
                continue;
            }

            const a: number = this.faceVertexA![f];
            const b: number = this.faceVertexB![f];
            const c: number = this.faceVertexC![f];

            const xA: number = Model.vertexScreenX[a];
            const xB: number = Model.vertexScreenX[b];
            const xC: number = Model.vertexScreenX[c];

            const yA: number = Model.vertexScreenY[a];
            const yB: number = Model.vertexScreenY[b];
            const yC: number = Model.vertexScreenY[c];

            const zA: number = Model.vertexScreenZ[a];
            const zB: number = Model.vertexScreenZ[b];
            const zC: number = Model.vertexScreenZ[c];

            if (clipped && (xA === -5000 || xB === -5000 || xC === -5000)) {
                Model.faceNearClipped[f] = true;

                const depthAverage: number = (((zA + zB + zC) / 3) | 0) + this.minDepth;
                Model.tmpDepthFaces[depthAverage][Model.tmpDepthFaceCount[depthAverage]++] = f;
            } else {
                if (picking && this.isMouseRoughlyInsideTriangle(Model.mouseX, Model.mouseY, yA, yB, yC, xA, xB, xC)) {
                    Model.pickedEntityTypecode[Model.pickedCount++] = typecode;
                    picking = false;
                }

                const dxAB: number = xA - xB;
                const dyAB: number = yA - yB;
                const dxCB: number = xC - xB;
                const dyCB: number = yC - yB;

                if (dxAB * dyCB - dyAB * dxCB <= 0) {
                    continue;
                }

                Model.faceNearClipped[f] = false;
                Model.faceClippedX[f] = xA < 0 || xB < 0 || xC < 0 || xA > Pix2D.sizeX || xB > Pix2D.sizeX || xC > Pix2D.sizeX;

                const depthAverage: number = (((zA + zB + zC) / 3) | 0) + this.minDepth;
                Model.tmpDepthFaces[depthAverage][Model.tmpDepthFaceCount[depthAverage]++] = f;
            }
        }

        if (!this.facePriority) {
            for (let depth: number = this.maxDepth - 1; depth >= 0; depth--) {
                const count: number = Model.tmpDepthFaceCount[depth];
                if (count <= 0) {
                    continue;
                }

                const faces: Int32Array = Model.tmpDepthFaces[depth];
                for (let f: number = 0; f < count; f++) {
                    try {
                        this.render3(faces[f]);
                    } catch (_e) {
                        // chrome's V8 optimizer hates us
                    }
                }
            }

            return;
        }

        for (let priority: number = 0; priority < 12; priority++) {
            Model.tmpPriorityFaceCount[priority] = 0;
            Model.tmpPriorityDepthSum[priority] = 0;
        }

        for (let depth: number = this.maxDepth - 1; depth >= 0; depth--) {
            const faceCount: number = Model.tmpDepthFaceCount[depth];

            if (faceCount > 0) {
                const faces: Int32Array = Model.tmpDepthFaces[depth];

                for (let i: number = 0; i < faceCount; i++) {
                    const priorityDepth: number = faces[i];
                    const priorityFace: number = this.facePriority[priorityDepth];
                    const priorityFaceCount: number = Model.tmpPriorityFaceCount[priorityFace]++;

                    Model.tmpPriorityFaces[priorityFace][priorityFaceCount] = priorityDepth;

                    if (priorityFace < 10) {
                        Model.tmpPriorityDepthSum[priorityFace] += depth;
                    } else if (priorityFace === 10) {
                        Model.tmpPriority10FaceDepth[priorityFaceCount] = depth;
                    } else {
                        Model.tmpPriority11FaceDepth[priorityFaceCount] = depth;
                    }
                }
            }
        }

        let averagePriorityDepthSum1_2: number = 0;
        if (Model.tmpPriorityFaceCount[1] > 0 || Model.tmpPriorityFaceCount[2] > 0) {
            averagePriorityDepthSum1_2 = ((Model.tmpPriorityDepthSum[1] + Model.tmpPriorityDepthSum[2]) / (Model.tmpPriorityFaceCount[1] + Model.tmpPriorityFaceCount[2])) | 0;
        }

        let averagePriorityDepthSum3_4: number = 0;
        if (Model.tmpPriorityFaceCount[3] > 0 || Model.tmpPriorityFaceCount[4] > 0) {
            averagePriorityDepthSum3_4 = ((Model.tmpPriorityDepthSum[3] + Model.tmpPriorityDepthSum[4]) / (Model.tmpPriorityFaceCount[3] + Model.tmpPriorityFaceCount[4])) | 0;
        }

        let averagePriorityDepthSum6_8: number = 0;
        if (Model.tmpPriorityFaceCount[6] > 0 || Model.tmpPriorityFaceCount[8] > 0) {
            averagePriorityDepthSum6_8 = ((Model.tmpPriorityDepthSum[6] + Model.tmpPriorityDepthSum[8]) / (Model.tmpPriorityFaceCount[6] + Model.tmpPriorityFaceCount[8])) | 0;
        }

        let priorityFace: number = 0;
        let priorityFaceCount: number = Model.tmpPriorityFaceCount[10];

        let priorityFaces: Int32Array = Model.tmpPriorityFaces[10];
        let priorityFaceDepths: Int32Array | null = Model.tmpPriority10FaceDepth;
        if (priorityFace === priorityFaceCount) {
            priorityFace = 0;
            priorityFaceCount = Model.tmpPriorityFaceCount[11];
            priorityFaces = Model.tmpPriorityFaces[11];
            priorityFaceDepths = Model.tmpPriority11FaceDepth;
        }

        let priorityDepth: number;
        if (priorityFace < priorityFaceCount && priorityFaceDepths) {
            priorityDepth = priorityFaceDepths[priorityFace];
        } else {
            priorityDepth = -1000;
        }

        for (let priority: number = 0; priority < 10; priority++) {
            while (priority === 0 && priorityDepth > averagePriorityDepthSum1_2) {
                try {
                    this.render3(priorityFaces[priorityFace++]);

                    if (priorityFace === priorityFaceCount && priorityFaces !== Model.tmpPriorityFaces[11]) {
                        priorityFace = 0;
                        priorityFaceCount = Model.tmpPriorityFaceCount[11];
                        priorityFaces = Model.tmpPriorityFaces[11];
                        priorityFaceDepths = Model.tmpPriority11FaceDepth;
                    }

                    if (priorityFace < priorityFaceCount && priorityFaceDepths) {
                        priorityDepth = priorityFaceDepths[priorityFace];
                    } else {
                        priorityDepth = -1000;
                    }
                } catch (_e) {
                    // chrome's V8 optimizer hates us
                }
            }

            while (priority === 3 && priorityDepth > averagePriorityDepthSum3_4) {
                try {
                    this.render3(priorityFaces[priorityFace++]);

                    if (priorityFace === priorityFaceCount && priorityFaces !== Model.tmpPriorityFaces[11]) {
                        priorityFace = 0;
                        priorityFaceCount = Model.tmpPriorityFaceCount[11];
                        priorityFaces = Model.tmpPriorityFaces[11];
                        priorityFaceDepths = Model.tmpPriority11FaceDepth;
                    }

                    if (priorityFace < priorityFaceCount && priorityFaceDepths) {
                        priorityDepth = priorityFaceDepths[priorityFace];
                    } else {
                        priorityDepth = -1000;
                    }
                } catch (_e) {
                    // chrome's V8 optimizer hates us
                }
            }

            while (priority === 5 && priorityDepth > averagePriorityDepthSum6_8) {
                try {
                    this.render3(priorityFaces[priorityFace++]);

                    if (priorityFace === priorityFaceCount && priorityFaces !== Model.tmpPriorityFaces[11]) {
                        priorityFace = 0;
                        priorityFaceCount = Model.tmpPriorityFaceCount[11];
                        priorityFaces = Model.tmpPriorityFaces[11];
                        priorityFaceDepths = Model.tmpPriority11FaceDepth;
                    }

                    if (priorityFace < priorityFaceCount && priorityFaceDepths) {
                        priorityDepth = priorityFaceDepths[priorityFace];
                    } else {
                        priorityDepth = -1000;
                    }
                } catch (_e) {
                    // chrome's V8 optimizer hates us
                }
            }

            const count: number = Model.tmpPriorityFaceCount[priority];
            const faces: Int32Array = Model.tmpPriorityFaces[priority];

            for (let i: number = 0; i < count; i++) {
                try {
                    this.render3(faces[i]);
                } catch (_e) {
                    // chrome's V8 optimizer hates us
                }
            }
        }

        while (priorityDepth !== -1000) {
            try {
                this.render3(priorityFaces[priorityFace++]);

                if (priorityFace === priorityFaceCount && priorityFaces !== Model.tmpPriorityFaces[11]) {
                    priorityFace = 0;
                    priorityFaces = Model.tmpPriorityFaces[11];
                    priorityFaceCount = Model.tmpPriorityFaceCount[11];
                    priorityFaceDepths = Model.tmpPriority11FaceDepth;
                }

                if (priorityFace < priorityFaceCount && priorityFaceDepths) {
                    priorityDepth = priorityFaceDepths[priorityFace];
                } else {
                    priorityDepth = -1000;
                }
            } catch (_e) {
                // chrome's V8 optimizer hates us
            }
        }
    }

    private render3(face: number): void {
        if (Model.faceNearClipped[face]) {
            this.render3ZClip(face);
            return;
        }

        const a: number = this.faceVertexA![face];
        const b: number = this.faceVertexB![face];
        const c: number = this.faceVertexC![face];

        if (Model.faceClippedX) {
            Pix3D.hclip = Model.faceClippedX[face];
        }

        if (!this.faceAlpha) {
            Pix3D.trans = 0;
        } else {
            Pix3D.trans = this.faceAlpha[face];
        }

        let type: number;
        if (!this.faceRenderType) {
            type = 0;
        } else {
            type = this.faceRenderType[face] & 0x3;
        }

        if (type === 0) {
            Pix3D.gouraudTriangle(
                Model.vertexScreenX[a], Model.vertexScreenX[b], Model.vertexScreenX[c],
                Model.vertexScreenY[a], Model.vertexScreenY[b], Model.vertexScreenY[c],
                this.faceColourA![face], this.faceColourB![face], this.faceColourC![face]
            );
        } else if (type === 1) {
            Pix3D.flatTriangle(
                Model.vertexScreenX[a], Model.vertexScreenX[b], Model.vertexScreenX[c],
                Model.vertexScreenY[a], Model.vertexScreenY[b], Model.vertexScreenY[c],
                Pix3D.colourTable[this.faceColourA![face]]
            );
        } else if (type === 2) {
            const texturedFace: number = this.faceRenderType![face] >> 2;
            const tA: number = this.faceTextureP![texturedFace];
            const tB: number = this.faceTextureM![texturedFace];
            const tC: number = this.faceTextureN![texturedFace];

            Pix3D.textureTriangle(
                Model.vertexScreenX[a], Model.vertexScreenX[b], Model.vertexScreenX[c],
                Model.vertexScreenY[a], Model.vertexScreenY[b], Model.vertexScreenY[c],
                this.faceColourA![face], this.faceColourB![face], this.faceColourC![face],
                Model.vertexViewSpaceX[tA], Model.vertexViewSpaceY[tA], Model.vertexViewSpaceZ[tA],
                Model.vertexViewSpaceX[tB], Model.vertexViewSpaceX[tC],
                Model.vertexViewSpaceY[tB], Model.vertexViewSpaceY[tC],
                Model.vertexViewSpaceZ[tB], Model.vertexViewSpaceZ[tC],
                this.faceColour![face]
            );
        } else if (type === 3) {
            const texturedFace: number = this.faceRenderType![face] >> 2;
            const tA: number = this.faceTextureP![texturedFace];
            const tB: number = this.faceTextureM![texturedFace];
            const tC: number = this.faceTextureN![texturedFace];

            Pix3D.textureTriangle(
                Model.vertexScreenX[a], Model.vertexScreenX[b], Model.vertexScreenX[c],
                Model.vertexScreenY[a], Model.vertexScreenY[b], Model.vertexScreenY[c],
                this.faceColourA![face], this.faceColourA![face], this.faceColourA![face],
                Model.vertexViewSpaceX[tA], Model.vertexViewSpaceY[tA], Model.vertexViewSpaceZ[tA],
                Model.vertexViewSpaceX[tB], Model.vertexViewSpaceX[tC],
                Model.vertexViewSpaceY[tB], Model.vertexViewSpaceY[tC],
                Model.vertexViewSpaceZ[tB], Model.vertexViewSpaceZ[tC],
                this.faceColour![face]
            );
        }
    }

    private render3ZClip(face: number): void {
        let elements: number = 0;

        const centerX: number = Pix3D.originX;
        const centerY: number = Pix3D.originY;

        const a: number = this.faceVertexA![face];
        const b: number = this.faceVertexB![face];
        const c: number = this.faceVertexC![face];

        const zA: number = Model.vertexViewSpaceZ[a];
        const zB: number = Model.vertexViewSpaceZ[b];
        const zC: number = Model.vertexViewSpaceZ[c];

        if (zA >= 50) {
            Model.clippedX[elements] = Model.vertexScreenX[a];
            Model.clippedY[elements] = Model.vertexScreenY[a];
            Model.clippedColour[elements++] = this.faceColourA![face];
        } else {
            const xA: number = Model.vertexViewSpaceX[a];
            const yA: number = Model.vertexViewSpaceY[a];
            const colourA: number = this.faceColourA![face];

            if (zC >= 50) {
                const scalar: number = (50 - zA) * Pix3D.divTable2[zC - zA];
                Model.clippedX[elements] = centerX + ((((xA + (((Model.vertexViewSpaceX[c] - xA) * scalar) >> 16)) << 9) / 50) | 0);
                Model.clippedY[elements] = centerY + ((((yA + (((Model.vertexViewSpaceY[c] - yA) * scalar) >> 16)) << 9) / 50) | 0);
                Model.clippedColour[elements++] = colourA + (((this.faceColourC![face] - colourA) * scalar) >> 16);
            }

            if (zB >= 50) {
                const scalar: number = (50 - zA) * Pix3D.divTable2[zB - zA];
                Model.clippedX[elements] = centerX + ((((xA + (((Model.vertexViewSpaceX[b] - xA) * scalar) >> 16)) << 9) / 50) | 0);
                Model.clippedY[elements] = centerY + ((((yA + (((Model.vertexViewSpaceY[b] - yA) * scalar) >> 16)) << 9) / 50) | 0);
                Model.clippedColour[elements++] = colourA + (((this.faceColourB![face] - colourA) * scalar) >> 16);
            }
        }

        if (zB >= 50) {
            Model.clippedX[elements] = Model.vertexScreenX[b];
            Model.clippedY[elements] = Model.vertexScreenY[b];
            Model.clippedColour[elements++] = this.faceColourB![face];
        } else {
            const xB: number = Model.vertexViewSpaceX[b];
            const yB: number = Model.vertexViewSpaceY[b];
            const colourB: number = this.faceColourB![face];

            if (zA >= 50) {
                const scalar: number = (50 - zB) * Pix3D.divTable2[zA - zB];
                Model.clippedX[elements] = centerX + ((((xB + (((Model.vertexViewSpaceX[a] - xB) * scalar) >> 16)) << 9) / 50) | 0);
                Model.clippedY[elements] = centerY + ((((yB + (((Model.vertexViewSpaceY[a] - yB) * scalar) >> 16)) << 9) / 50) | 0);
                Model.clippedColour[elements++] = colourB + (((this.faceColourA![face] - colourB) * scalar) >> 16);
            }

            if (zC >= 50) {
                const scalar: number = (50 - zB) * Pix3D.divTable2[zC - zB];
                Model.clippedX[elements] = centerX + ((((xB + (((Model.vertexViewSpaceX[c] - xB) * scalar) >> 16)) << 9) / 50) | 0);
                Model.clippedY[elements] = centerY + ((((yB + (((Model.vertexViewSpaceY[c] - yB) * scalar) >> 16)) << 9) / 50) | 0);
                Model.clippedColour[elements++] = colourB + (((this.faceColourC![face] - colourB) * scalar) >> 16);
            }
        }

        if (zC >= 50) {
            Model.clippedX[elements] = Model.vertexScreenX[c];
            Model.clippedY[elements] = Model.vertexScreenY[c];
            Model.clippedColour[elements++] = this.faceColourC![face];
        } else {
            const xC: number = Model.vertexViewSpaceX[c];
            const yC: number = Model.vertexViewSpaceY[c];
            const colourC: number = this.faceColourC![face];

            if (zB >= 50) {
                const scalar: number = (50 - zC) * Pix3D.divTable2[zB - zC];
                Model.clippedX[elements] = centerX + ((((xC + (((Model.vertexViewSpaceX[b] - xC) * scalar) >> 16)) << 9) / 50) | 0);
                Model.clippedY[elements] = centerY + ((((yC + (((Model.vertexViewSpaceY[b] - yC) * scalar) >> 16)) << 9) / 50) | 0);
                Model.clippedColour[elements++] = colourC + (((this.faceColourB![face] - colourC) * scalar) >> 16);
            }

            if (zA >= 50) {
                const scalar: number = (50 - zC) * Pix3D.divTable2[zA - zC];
                Model.clippedX[elements] = centerX + ((((xC + (((Model.vertexViewSpaceX[a] - xC) * scalar) >> 16)) << 9) / 50) | 0);
                Model.clippedY[elements] = centerY + ((((yC + (((Model.vertexViewSpaceY[a] - yC) * scalar) >> 16)) << 9) / 50) | 0);
                Model.clippedColour[elements++] = colourC + (((this.faceColourA![face] - colourC) * scalar) >> 16);
            }
        }

        const x0: number = Model.clippedX[0];
        const x1: number = Model.clippedX[1];
        const x2: number = Model.clippedX[2];
        const y0: number = Model.clippedY[0];
        const y1: number = Model.clippedY[1];
        const y2: number = Model.clippedY[2];

        if ((x0 - x1) * (y2 - y1) - (y0 - y1) * (x2 - x1) <= 0) {
            return;
        }

        Pix3D.hclip = false;

        if (elements === 3) {
            if (x0 < 0 || x1 < 0 || x2 < 0 || x0 > Pix2D.sizeX || x1 > Pix2D.sizeX || x2 > Pix2D.sizeX) {
                Pix3D.hclip = true;
            }

            let type: number;
            if (!this.faceRenderType) {
                type = 0;
            } else {
                type = this.faceRenderType[face] & 0x3;
            }

            if (type === 0) {
                Pix3D.gouraudTriangle(
                    x0, x1, x2,
                    y0, y1, y2,
                    Model.clippedColour[0], Model.clippedColour[1], Model.clippedColour[2]
                );
            } else if (type === 1 && this.faceColourA) {
                Pix3D.flatTriangle(
                    x0, x1, x2,
                    y0, y1, y2,
                    Pix3D.colourTable[this.faceColourA[face]]
                );
            } else if (type === 2) {
                const texturedFace: number = this.faceRenderType![face] >> 2;
                const tA: number = this.faceTextureP![texturedFace];
                const tB: number = this.faceTextureM![texturedFace];
                const tC: number = this.faceTextureN![texturedFace];

                Pix3D.textureTriangle(
                    x0, x1, x2,
                    y0, y1, y2,
                    Model.clippedColour[0], Model.clippedColour[1], Model.clippedColour[2],
                    Model.vertexViewSpaceX[tA], Model.vertexViewSpaceY[tA], Model.vertexViewSpaceZ[tA],
                    Model.vertexViewSpaceX[tB], Model.vertexViewSpaceX[tC],
                    Model.vertexViewSpaceY[tB], Model.vertexViewSpaceY[tC],
                    Model.vertexViewSpaceZ[tB], Model.vertexViewSpaceZ[tC],
                    this.faceColour![face]
                );
            } else if (type === 3) {
                const texturedFace: number = this.faceRenderType![face] >> 2;
                const tA: number = this.faceTextureP![texturedFace];
                const tB: number = this.faceTextureM![texturedFace];
                const tC: number = this.faceTextureN![texturedFace];

                Pix3D.textureTriangle(
                    x0, x1, x2,
                    y0, y1, y2,
                    this.faceColourA![face], this.faceColourA![face], this.faceColourA![face],
                    Model.vertexViewSpaceX[tA], Model.vertexViewSpaceY[tA], Model.vertexViewSpaceZ[tA],
                    Model.vertexViewSpaceX[tB], Model.vertexViewSpaceX[tC],
                    Model.vertexViewSpaceY[tB], Model.vertexViewSpaceY[tC],
                    Model.vertexViewSpaceZ[tB], Model.vertexViewSpaceZ[tC],
                    this.faceColour![face]
                );
            }
        } else if (elements === 4) {
            if (x0 < 0 || x1 < 0 || x2 < 0 || x0 > Pix2D.sizeX || x1 > Pix2D.sizeX || x2 > Pix2D.sizeX || Model.clippedX[3] < 0 || Model.clippedX[3] > Pix2D.sizeX) {
                Pix3D.hclip = true;
            }

            let type: number;
            if (!this.faceRenderType) {
                type = 0;
            } else {
                type = this.faceRenderType[face] & 0x3;
            }

            if (type === 0) {
                Pix3D.gouraudTriangle(
                    x0, x1, x2,
                    y0, y1, y2,
                    Model.clippedColour[0], Model.clippedColour[1], Model.clippedColour[2]
                );

                Pix3D.gouraudTriangle(
                    x0, x2, Model.clippedX[3],
                    y0, y2, Model.clippedY[3],
                    Model.clippedColour[0], Model.clippedColour[2], Model.clippedColour[3]
                );
            } else if (type === 1) {
                if (this.faceColourA) {
                    const colour: number = Pix3D.colourTable[this.faceColourA[face]];

                    Pix3D.flatTriangle(
                        x0, x1, x2,
                        y0, y1, y2,
                        colour
                    );

                    Pix3D.flatTriangle(
                        x0, x2, Model.clippedX[3],
                        y0, y2, Model.clippedY[3],
                        colour
                    );
                }
            } else if (type === 2) {
                const texturedFace: number = this.faceRenderType![face] >> 2;
                const tA: number = this.faceTextureP![texturedFace];
                const tB: number = this.faceTextureM![texturedFace];
                const tC: number = this.faceTextureN![texturedFace];

                Pix3D.textureTriangle(
                    x0, x1, x2,
                    y0, y1, y2,
                    Model.clippedColour[0], Model.clippedColour[1], Model.clippedColour[2],
                    Model.vertexViewSpaceX[tA], Model.vertexViewSpaceY[tA], Model.vertexViewSpaceZ[tA],
                    Model.vertexViewSpaceX[tB], Model.vertexViewSpaceX[tC],
                    Model.vertexViewSpaceY[tB], Model.vertexViewSpaceY[tC],
                    Model.vertexViewSpaceZ[tB], Model.vertexViewSpaceZ[tC],
                    this.faceColour![face]
                );

                Pix3D.textureTriangle(
                    x0, x2, Model.clippedX[3],
                    y0, y2, Model.clippedY[3],
                    Model.clippedColour[0], Model.clippedColour[2], Model.clippedColour[3],
                    Model.vertexViewSpaceX[tA], Model.vertexViewSpaceY[tA], Model.vertexViewSpaceZ[tA],
                    Model.vertexViewSpaceX[tB], Model.vertexViewSpaceX[tC],
                    Model.vertexViewSpaceY[tB], Model.vertexViewSpaceY[tC],
                    Model.vertexViewSpaceZ[tB], Model.vertexViewSpaceZ[tC],
                    this.faceColour![face]
                );
            } else if (type === 3) {
                const texturedFace: number = this.faceRenderType![face] >> 2;
                const tA: number = this.faceTextureP![texturedFace];
                const tB: number = this.faceTextureM![texturedFace];
                const tC: number = this.faceTextureN![texturedFace];

                Pix3D.textureTriangle(
                    x0, x1, x2,
                    y0, y1, y2,
                    this.faceColourA![face], this.faceColourA![face], this.faceColourA![face],
                    Model.vertexViewSpaceX[tA], Model.vertexViewSpaceY[tA], Model.vertexViewSpaceZ[tA],
                    Model.vertexViewSpaceX[tB], Model.vertexViewSpaceX[tC],
                    Model.vertexViewSpaceY[tB], Model.vertexViewSpaceY[tC],
                    Model.vertexViewSpaceZ[tB], Model.vertexViewSpaceZ[tC],
                    this.faceColour![face]
                );

                Pix3D.textureTriangle(
                    x0, x2, Model.clippedX[3],
                    y0, y2, Model.clippedY[3],
                    this.faceColourA![face], this.faceColourA![face], this.faceColourA![face],
                    Model.vertexViewSpaceX[tA], Model.vertexViewSpaceY[tA], Model.vertexViewSpaceZ[tA],
                    Model.vertexViewSpaceX[tB], Model.vertexViewSpaceX[tC],
                    Model.vertexViewSpaceY[tB], Model.vertexViewSpaceY[tC],
                    Model.vertexViewSpaceZ[tB], Model.vertexViewSpaceZ[tC],
                    this.faceColour![face]
                );
            }
        }
    }

    isMouseRoughlyInsideTriangle(x: number, y: number, yA: number, yB: number, yC: number, xA: number, xB: number, xC: number): boolean {
        if (y < yA && y < yB && y < yC) {
            return false;
        } else if (y > yA && y > yB && y > yC) {
            return false;
        } else if (x < xA && x < xB && x < xC) {
            return false;
        } else if (x > xA && x > xB && x > xC) {
            return false;
        } else {
            return true;
        }
    }
}
