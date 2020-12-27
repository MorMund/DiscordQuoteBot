declare module "random" {
    export function float(min: number, max: number): number;
    export function int(min: number, max: number): number;
    export function boolean(): boolean;
}