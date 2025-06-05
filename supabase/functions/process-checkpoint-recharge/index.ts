import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

interface CheckpointRechargeRequest {
  card_id: string;
  recharge_amount: number;
  payment_method_at_checkpoint: string;
  staff_id: string;
  checkpoint_id: string;
  client_request_id: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body: CheckpointRechargeRequest = await req.json();

    // Input validation
    if (!body.card_id || typeof body.card_id !== "string") {
      return new Response(JSON.stringify({ error: "Missing or invalid card_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (body.recharge_amount == null || typeof body.recharge_amount !== "number" || body.recharge_amount <= 0) {
      return new Response(JSON.stringify({ error: "Missing or invalid recharge_amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!body.payment_method_at_checkpoint || typeof body.payment_method_at_checkpoint !== "string") {
      return new Response(JSON.stringify({ error: "Missing or invalid payment_method_at_checkpoint" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!body.staff_id || typeof body.staff_id !== "string") {
      return new Response(JSON.stringify({ error: "Missing or invalid staff_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!body.checkpoint_id || typeof body.checkpoint_id !== "string") {
      return new Response(JSON.stringify({ error: "Missing or invalid checkpoint_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!body.client_request_id || typeof body.client_request_id !== "string") {
      return new Response(JSON.stringify({ error: "Missing or invalid client_request_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Basic UUID validation (length check for a common UUID format like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
    if (body.client_request_id.length !== 36) {
        return new Response(JSON.stringify({ error: "Invalid client_request_id format (expected 36 characters)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data, error } = await supabaseClient.rpc("sp_process_checkpoint_recharge", {
      card_id_in: body.card_id,
      amount_in: body.recharge_amount,
      payment_method_in: body.payment_method_at_checkpoint,
      staff_id_in: body.staff_id,
      client_request_id_in: body.client_request_id,
      checkpoint_id_in: body.checkpoint_id,
    });

    if (error) {
      console.error("Error calling stored procedure:", error);
      // Default to 500, specific errors handled below based on SP response
      let status = 500;
      let message = "Internal Server Error";

      if (error.message.includes("P0001")) { // Custom exception from SP
        const errDetails = JSON.parse(error.message.substring(error.message.indexOf('{')));
        message = errDetails.message;
        if (errDetails.status_code === 404) status = 404; // Card not found
        else if (errDetails.status_code === 409) status = 409; // Idempotency conflict
        else if (errDetails.status_code === 400) status = 400; // Bad request (e.g. invalid amount)
        else status = errDetails.status_code || 500;
      } else if (error.code === '23505') { // Unique violation (could be idempotency if not handled by P0001)
        status = 409;
        message = "Conflict: Duplicate request or resource already exists.";
      }

      return new Response(JSON.stringify({ error: message, details: error.message }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The SP should return a JSON object with status, message, and potentially new_balance
    // If data is null or not as expected, it's an issue.
    if (!data || typeof data !== 'object' || !('status' in data)) {
        console.error("Unexpected response from stored procedure:", data);
        return new Response(JSON.stringify({ error: "Unexpected response from stored procedure" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    
    // Determine HTTP status based on SP's response status
    let httpStatus = 200; // Default success
    if (data.status === "CARD_NOT_FOUND") httpStatus = 404;
    else if (data.status === "IDEMPOTENCY_CONFLICT") httpStatus = 409;
    else if (data.status === "INVALID_INPUT") httpStatus = 400;
    else if (data.status !== "SUCCESS") httpStatus = 500; // Catch-all for other non-success SP statuses

    return new Response(JSON.stringify(data), {
      status: httpStatus,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("Unhandled error:", e);
    let errorMessage = "Internal Server Error";
    if (e instanceof SyntaxError) { // JSON parsing error
        errorMessage = "Invalid JSON payload";
        return new Response(JSON.stringify({ error: errorMessage }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    return new Response(JSON.stringify({ error: errorMessage, details: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});