#!/usr/bin/env bun
import { assertWorkflowPins } from '../lib/version-pins.ts';

assertWorkflowPins();
process.stdout.write('version pins are consistent\n');
