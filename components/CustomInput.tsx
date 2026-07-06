import React from "react";
import { Control, FieldPath } from "react-hook-form";

import { z } from "zod";
import {
    FormControl,
    FormField,
    FormLabel,
    FormMessage,
  } from "@/components/ui/form";
  import { Input } from "@/components/ui/input";
import { authFormSchema } from "@/lib/utils";
  
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const formSchema =authFormSchema('sign-up');

  
  interface CustomInput{
    control : Control<z.infer<typeof formSchema>>
    name:FieldPath<z.infer<typeof formSchema>>,
    label:string,
    placeholder:string,
    description?:string
  }
  
const CustomInput = ({control,name,label,placeholder,description}:CustomInput) => {
    
  return (
    
              <FormField
                control={control}
                name={name}
                render={({ field }) => (
                  <div className="form-item">
                    
                    <FormLabel className="form-label">{label}</FormLabel>
                    <div className="flex w-full ">
                      <FormControl>
                        <Input placeholder={placeholder}
                        className="input-class"
                        type={(name==='password' || name==='ssn')?'password':"text"}
                        autoComplete={name==='password' ? 'current-password' : name === 'ssn' ? 'off' : 'on'}
                        {...field} />
                      </FormControl>
                    </div>
                    {description && (
                      <p className="text-12 text-gray-500 mt-1">{description}</p>
                    )}
                    <FormMessage className="form-message mt-2" />
                  
                  </div>
                )}
              />
         
    
  )
}

export default CustomInput