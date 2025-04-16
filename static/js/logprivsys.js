import { emProducao } from "./ambienteini.js";

export let logger = {
 log: (...args) => {
  if (!emProducao) {
   console.log(...args);
  }
 },
 warn: (...args) => {
  if (!emProducao) {
   console.warn(...args);
  }
 },
 error: (...args) => {
  if (!emProducao) {
   console.error(...args);
  }
 },
 info: (...args) => {
  if (!emProducao) {
   console.info(...args);
  }
 },
 debug: (...args) => {
  if (!emProducao) {
   console.debug(...args);
  }
 },
 groupCollapsed: (...args) => {
  if (!emProducao) {
    console.debug(...args);
  }
 },
 groupEnd: (...args) => {
  if (!emProducao) {
   console.debug(...args);
  }
 },
 groupCollapsed: (...args) => {
  if (!emProducao) {
    console.debug(...args);
  }
 },
 groupEnd: (...args) => {
  if (!emProducao) {
   console.debug(...args);
  }
 },
};
