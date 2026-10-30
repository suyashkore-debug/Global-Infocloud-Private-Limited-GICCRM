<?php

namespace App\Services;

use RuntimeException;

/** A CSV the leads import cannot use (too few or too many rows); the message is shown as is. */
class LeadImportException extends RuntimeException {}
